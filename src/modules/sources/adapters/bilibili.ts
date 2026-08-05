import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';
import { SourceError } from '../types.js';
import { parseTitleArtistQuery } from '../../search/query.js';
import { extractKeyFromWbiUrl, getMixinKey, signParams } from './bilibili/wbi.js';
import { MinIntervalGate } from './bilibili/rate-limit.js';

/**
 * BilibiliAdapter — keyless bilibili web search + official iframe embed.
 *
 * IMPORTANT — design rules (same spirit as the YouTube adapter):
 *   - We DO NOT extract audio / download videos / bypass login walls.
 *     Playback is the official embed player:
 *       https://player.bilibili.com/player.html?bvid=<bvid>
 *     Region-locked / members-only videos behave exactly like an anonymous
 *     browser session — nothing is circumvented.
 *   - Search uses the public web interface with WBI signing (see ./bilibili/wbi.ts).
 *     This is NOT an officially licensed third-party API: anonymous calls
 *     risk -412 risk-control. Mitigations: MinIntervalGate, browser-like
 *     headers, optional SESSDATA cookie, and graceful degradation — a
 *     risk-controlled bilibili lands in unified search's `errors[]` without
 *     affecting other sources.
 */

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';
const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const BVID_RE = /^BV[0-9A-Za-z]+$/;
const UNKNOWN_ARTIST = '未知艺术家';

interface WbiKeyCache {
  mixinKey: string;
  expiresAt: number;
}

export interface BilibiliAdapterOptions {
  sessdata?: string | undefined;
  minIntervalMs?: number;
  wbiTtlSec?: number;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class BilibiliAdapter implements SourceAdapter {
  readonly id = 'bilibili' as const;
  readonly displayName = 'Bilibili';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  private readonly sessdata?: string | undefined;
  private readonly wbiTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly gate: MinIntervalGate;
  private keyCache: WbiKeyCache | null = null;

  constructor(opts: BilibiliAdapterOptions = {}) {
    this.sessdata = opts.sessdata || undefined;
    this.wbiTtlMs = (opts.wbiTtlSec ?? 86_400) * 1000;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.gate = new MinIntervalGate(opts.minIntervalMs ?? 800);
  }

  async search(params: SearchParams): Promise<RawHit[]> {
    const limit = Math.max(1, Math.min(50, params.limit ?? 20));
    const query = params.query.trim();
    const json = await this.searchOnce(query, limit, false);
    const hits = parseSearchResults(json);

    const titleQuery = parseTitleArtistQuery(query)?.title ?? query;
    const queryLower = titleQuery.toLowerCase();
    return hits
      .filter((hit) => {
        const duration = hit.durationSec ?? 0;
        if (duration < 45 || duration > 15 * 60) return false;
        if (queryLower.length < 2) return true;
        return hit.title.toLowerCase().includes(queryLower);
      })
      .map((hit) => {
        const { title, artists } = extractMusicMeta(hit.title);
        return { ...hit, title, artists };
      });
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!BVID_RE.test(externalId)) return [];
    // Embed resolution is static: payload = bvid, frontend iframes
    // https://player.bilibili.com/player.html?bvid=<payload>&autoplay=0
    return [{ type: 'embed', payload: externalId, expiresAt: null }];
  }

  async health(): Promise<HealthSnapshot> {
    try {
      const mixinKey = await this.getMixinKey();
      return {
        status: 'healthy',
        message: mixinKey ? undefined : 'no mixin key',
        checkedAt: Date.now(),
      };
    } catch (err) {
      const isRateLimited = err instanceof SourceError && err.code === 'rate_limited';
      return {
        status: isRateLimited ? 'degraded' : 'unavailable',
        message: isRateLimited
          ? 'risk-controlled (-412); consider setting BILIBILI_SESSDATA'
          : err instanceof Error
            ? err.message
            : String(err),
        checkedAt: Date.now(),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  /** One signed search call; on -412 invalidate keys and retry once. */
  private async searchOnce(keyword: string, limit: number, retried: boolean): Promise<unknown> {
    const mixinKey = await this.getMixinKey();
    const signed = signParams(
      { keyword, search_type: 'video', page: 1, page_size: limit },
      mixinKey,
    );
    const url = `${SEARCH_URL}?${new URLSearchParams(signed).toString()}`;

    const json = await this.getJson(url);
    const code = (json as { code?: unknown } | null)?.code;

    if (code === 0) return json;
    if (code === -412) {
      if (!retried) {
        this.keyCache = null; // keys may have rotated — refresh and retry once
        return this.searchOnce(keyword, limit, true);
      }
      throw new SourceError(
        this.id,
        'rate_limited',
        'bilibili risk-control (-412); consider setting BILIBILI_SESSDATA',
      );
    }
    throw new SourceError(this.id, 'unknown', `bilibili search returned code ${String(code)}`);
  }

  /** Fetch + cache the wbi mixin key. */
  private async getMixinKey(): Promise<string> {
    if (this.keyCache && this.keyCache.expiresAt > Date.now()) {
      return this.keyCache.mixinKey;
    }
    const json = await this.getJson(NAV_URL);
    const wbiImg = (json as { data?: { wbi_img?: { img_url?: unknown; sub_url?: unknown } } } | null)
      ?.data?.wbi_img;
    if (typeof wbiImg?.img_url !== 'string' || typeof wbiImg?.sub_url !== 'string') {
      throw new SourceError(this.id, 'unknown', 'bilibili nav response missing wbi_img');
    }
    const mixinKey = getMixinKey(
      extractKeyFromWbiUrl(wbiImg.img_url),
      extractKeyFromWbiUrl(wbiImg.sub_url),
    );
    this.keyCache = { mixinKey, expiresAt: Date.now() + this.wbiTtlMs };
    return mixinKey;
  }

  private async getJson(url: string): Promise<unknown> {
    await this.gate.wait();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        signal: ctrl.signal,
        headers: this.buildHeaders(),
      });
    } catch (err) {
      throw new SourceError(this.id, 'network', 'bilibili request failed', err);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 412) {
      throw new SourceError(this.id, 'rate_limited', 'bilibili HTTP 412 risk-control');
    }
    if (!res.ok) {
      throw new SourceError(this.id, 'network', `bilibili HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new SourceError(this.id, 'unknown', 'bilibili returned invalid JSON', err);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Referer: 'https://www.bilibili.com/',
    };
    if (this.sessdata) {
      headers['Cookie'] = `SESSDATA=${this.sessdata}`;
    }
    return headers;
  }
}

// -----------------------------------------------------------------------------
// pure helpers (exported for unit tests)
// -----------------------------------------------------------------------------

/** Try to extract a cleaner title + artist from common Bilibili music-video title patterns. */
function extractMusicMeta(rawTitle: string): { title: string; artists: string } {
  const cleaned = stripHtmlTags(rawTitle).trim();

  // pattern: 【...】歌手 - 歌名 ...
  // pattern: 歌手 - 歌名 ...
  const noBrackets = cleaned.replace(/^[（(〔【[{「].*?[）)〕】}\]」]\s*/, '');

  // "歌手《歌名》" or "歌手&amp;歌手《歌名》"
  const bookMatch = noBrackets.match(/^(.*?)《([^》]+)》/);
  if (bookMatch) {
    const artists = bookMatch[1]!.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const title = bookMatch[2]!.trim();
    if (artists && title && looksLikeArtist(artists)) {
      return { title, artists };
    }
  }

  // "歌手 - 歌名" or "歌名 - 歌手"
  const dashParts = noBrackets.split(/\s*[-–—]\s+/);
  if (dashParts.length === 2) {
    const a = stripTrailingSuffixes(dashParts[0]!.trim());
    const b = stripTrailingSuffixes(dashParts[1]!.trim());
    const aIsArtist = looksLikeArtist(a);
    const bIsArtist = looksLikeArtist(b);
    if (aIsArtist && !bIsArtist) {
      return { title: b, artists: a };
    }
    if (bIsArtist && !aIsArtist) {
      return { title: a, artists: b };
    }
    // both sides look like names: default to "artist - song" (left is artist)
    if (aIsArtist && bIsArtist) {
      return { title: b, artists: a };
    }
  }

  // The uploader remains publisher metadata; it is not reliable song-artist metadata.
  return { title: cleaned, artists: UNKNOWN_ARTIST };
}

function looksLikeArtist(s: string): boolean {
  // allow CJK/Latin artist names and &/and combos
  if (!s) return false;
  const trimmed = s.replace(/&/g, '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  // reject pure numbers / symbols
  if (/^[\d\s\.\-]+$/.test(trimmed)) return false;
  // reject obvious non-artist phrases
  if (/^第\d+集|^episode|walking|vlog|tutorial|review|reaction|cover|remix|instrumental/i.test(trimmed)) return false;
  return true;
}

function stripTrailingSuffixes(s: string): string {
  return s
    .replace(/\s*(mv|pv|live|cover|instrumental|remix|acoustic|version|official|hd|4k|1080p|2160p)\s*\d*\s*$/i, '')
    .replace(/[（(〔【[{「].*?[）)〕】}\]」]\s*$/, '')
    .trim();
}

// -----------------------------------------------------------------------------
// pure helpers (exported for unit tests)
// -----------------------------------------------------------------------------

interface BiliSearchResultItem {
  bvid?: unknown;
  title?: unknown;
  author?: unknown;
  duration?: unknown;
  pic?: unknown;
  aid?: unknown;
  play?: unknown;
  video_review?: unknown;
}

/** Map a wbi/search/type JSON body to RawHits. Tolerates missing fields. */
export function parseSearchResults(json: unknown): RawHit[] {
  const result = (json as { data?: { result?: unknown } } | null)?.data?.result;
  if (!Array.isArray(result)) return [];

  const hits: RawHit[] = [];
  for (const raw of result as BiliSearchResultItem[]) {
    if (typeof raw?.bvid !== 'string' || !BVID_RE.test(raw.bvid)) continue;
    const publisher = typeof raw.author === 'string' && raw.author ? raw.author : undefined;
    const rawTitle = typeof raw.title === 'string' ? raw.title : raw.bvid;
    hits.push({
      externalId: raw.bvid,
      title: stripHtmlTags(rawTitle),
      artists: UNKNOWN_ARTIST,
      durationSec: parseDuration(raw.duration),
      thumbnailUrl: normalizePicUrl(raw.pic),
      publisher,
      metadata: {
        bvid: raw.bvid,
        aid: typeof raw.aid === 'number' ? raw.aid : undefined,
        quality: {
          playCount: typeof raw.play === 'number' ? raw.play : undefined,
          interactionCount: typeof raw.video_review === 'number' ? raw.video_review : undefined,
        },
      },
    });
  }
  return hits;
}

/** bilibili wraps keyword matches in <em class="keyword">…</em>. */
export function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

/** Duration comes as "mm:ss" (occasionally "hh:mm:ss" or a number). */
export function parseDuration(d: unknown): number | undefined {
  if (typeof d === 'number' && Number.isFinite(d)) return d;
  if (typeof d !== 'string') return undefined;
  const parts = d.split(':').map(Number);
  if (parts.length < 2 || !parts.every((n) => Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** pic URLs are protocol-relative ("//i0.hdslb.com/…"). */
function normalizePicUrl(pic: unknown): string | undefined {
  if (typeof pic !== 'string' || !pic) return undefined;
  return pic.startsWith('//') ? `https:${pic}` : pic;
}
