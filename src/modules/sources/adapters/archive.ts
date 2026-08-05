import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';
import { SourceError } from '../types.js';

/**
 * ArchiveOrgAdapter — Internet Archive open audio catalog.
 *
 * Why this source matters: it needs NO API key and NO registration, which
 * makes it the reference "open_source" implementation. Everything is the
 * official public API:
 *
 *   search:  GET https://archive.org/advancedsearch.php?q=...&output=json
 *   files:   GET https://archive.org/metadata/{identifier}
 *   stream:  https://archive.org/download/{identifier}/{filename}
 *            (supports HTTP Range, sends Access-Control-Allow-Origin: *)
 *
 * Coverage skews to public-domain / live / CC-licensed recordings; recent
 * commercial hits won't be here. That's fine — other sources fill the gap,
 * and unified search merges everything.
 *
 * Metadata calls are slow (seconds), so resolved file lists are cached
 * in-adapter for 10 minutes. Stream URLs never expire, so a stale cache
 * entry is harmless.
 */

const BASE = 'https://archive.org';
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_STREAM_OPTIONS = 2;
const MAX_METADATA_CANDIDATES = 8;
const METADATA_CONCURRENCY = 4;

/** Audio extensions we consider playable, best first. */
const AUDIO_FORMAT_PREFS: Array<{ ext: RegExp; formatHint: RegExp; priority: number }> = [
  { ext: /\.mp3$/i, formatHint: /mp3/i, priority: 0 },
  { ext: /\.m4a$/i, formatHint: /m4a|mpeg-4 audio|aac/i, priority: 1 },
  { ext: /\.ogg$/i, formatHint: /ogg/i, priority: 2 },
  { ext: /\.flac$/i, formatHint: /flac/i, priority: 3 },
];

interface MetadataCacheEntry {
  files: string[];
  expiresAt: number;
}

export class ArchiveOrgAdapter implements SourceAdapter {
  readonly id = 'open_source' as const;
  readonly displayName = 'Internet Archive';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly metadataCache = new Map<string, MetadataCacheEntry>();

  constructor(opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async search(params: SearchParams): Promise<RawHit[]> {
    const limit = Math.max(1, Math.min(50, params.limit ?? 20));
    const query = params.query.trim();
    const q = `title:("${query}") AND mediatype:(audio)`;
    const url =
      `${BASE}/advancedsearch.php?q=${encodeURIComponent(q)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=duration` +
      `&rows=${limit}&output=json`;

    const json = await this.getJson(url, 'search');
    const hits = parseSearchResponse(json);
    if (hits.length > 0) return this.keepAudioCandidates(hits);

    // fallback to fieldless query if title-scoped search returns nothing
    const fallbackQ = `${query} AND mediatype:(audio)`;
    const fallbackUrl =
      `${BASE}/advancedsearch.php?q=${encodeURIComponent(fallbackQ)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=duration` +
      `&rows=${limit}&output=json`;
    const fallbackJson = await this.getJson(fallbackUrl, 'search');
    return this.keepAudioCandidates(parseSearchResponse(fallbackJson));
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!externalId || externalId.includes('..') || externalId.includes('/')) return [];

    const files = await this.getAudioFiles(externalId);
    return files.slice(0, MAX_STREAM_OPTIONS).map((name) => ({
      type: 'stream' as const,
      payload: `${BASE}/download/${encodeURIComponent(externalId)}/${encodeURIPathSegment(name)}`,
      expiresAt: null,
    }));
  }

  async health(): Promise<HealthSnapshot> {
    try {
      const res = await this.fetchWithTimeout(
        `${BASE}/advancedsearch.php?q=test&rows=1&output=json`,
        5_000,
      );
      return {
        status: res.ok ? 'healthy' : 'degraded',
        message: res.ok ? undefined : `HTTP ${res.status}`,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        status: 'unavailable',
        message: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private async getAudioFiles(identifier: string): Promise<string[]> {
    const cached = this.metadataCache.get(identifier);
    if (cached && cached.expiresAt > Date.now()) return cached.files;

    const json = await this.getJson(`${BASE}/metadata/${encodeURIComponent(identifier)}`, 'metadata');
    const files = pickAudioFiles(json);
    this.metadataCache.set(identifier, {
      files,
      expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
    });
    return files;
  }

  private async keepAudioCandidates(hits: RawHit[]): Promise<RawHit[]> {
    const candidates = hits.slice(0, MAX_METADATA_CANDIDATES);
    const eligible = await mapWithConcurrency(candidates, METADATA_CONCURRENCY, async (hit) => {
      try {
        return (await this.getAudioFiles(hit.externalId)).length > 0 ? hit : null;
      } catch {
        return null;
      }
    });
    return eligible.filter((hit): hit is RawHit => hit !== null);
  }

  private async getJson(url: string, what: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout(url, this.timeoutMs);
    } catch (err) {
      throw new SourceError(this.id, 'network', `archive.org ${what} request failed`, err);
    }
    if (res.status === 404) {
      throw new SourceError(this.id, 'source_gone', `archive.org item not found: ${url}`);
    }
    if (!res.ok) {
      throw new SourceError(this.id, 'network', `archive.org ${what} HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new SourceError(this.id, 'unknown', `archive.org ${what} returned invalid JSON`, err);
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await this.fetchFn(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'omnitunes/0.1 (https://github.com/thy-0629/omnitunes)' },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await fn(values[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

// -----------------------------------------------------------------------------
// pure helpers (exported for unit tests)
// -----------------------------------------------------------------------------

interface AdvancedSearchDoc {
  identifier?: unknown;
  title?: unknown;
  creator?: unknown;
  duration?: unknown;
}

/** Map an advancedsearch.php JSON body to RawHits. Tolerates missing fields. */
export function parseSearchResponse(json: unknown): RawHit[] {
  const docs = (json as { response?: { docs?: unknown } } | null)?.response?.docs;
  if (!Array.isArray(docs)) return [];

  const hits: RawHit[] = [];
  for (const raw of docs as AdvancedSearchDoc[]) {
    if (typeof raw?.identifier !== 'string' || !raw.identifier) continue;
    const title = typeof raw.title === 'string' && raw.title ? raw.title : raw.identifier;
    const artists = normalizeCreator(raw.creator);
    const durationSec = normalizeDuration(raw.duration);
    hits.push({
      externalId: raw.identifier,
      title,
      artists,
      durationSec,
      publisher: 'Internet Archive',
      metadata: { url: `${BASE}/details/${raw.identifier}` },
    });
  }
  return hits;
}

interface MetadataFileEntry {
  name?: unknown;
  format?: unknown;
}

/**
 * Pick playable audio file names from a metadata API response, best format
 * first (mp3 > ogg > flac). Skips derivatives like *_spectrogram.png etc.
 */
export function pickAudioFiles(json: unknown): string[] {
  const files = (json as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) return [];

  const candidates: Array<{ name: string; priority: number }> = [];
  for (const raw of files as MetadataFileEntry[]) {
    if (typeof raw?.name !== 'string' || !raw.name) continue;
    const name = raw.name;
    if (name.includes('/')) continue; // skip files in subdirectories (derivatives)
    const format = typeof raw.format === 'string' ? raw.format : '';
    for (const pref of AUDIO_FORMAT_PREFS) {
      if (pref.ext.test(name) || pref.formatHint.test(format)) {
        candidates.push({ name, priority: pref.priority });
        break;
      }
    }
  }

  return candidates
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .map((c) => c.name);
}

/** Encode one path segment (file names may contain spaces / unicode). */
export function encodeURIPathSegment(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

function normalizeCreator(creator: unknown): string {
  if (Array.isArray(creator)) {
    const parts = creator.filter((c): c is string => typeof c === 'string' && c.length > 0);
    if (parts.length > 0) return parts.join(', ');
  }
  if (typeof creator === 'string' && creator) return creator;
  return 'Unknown';
}

function normalizeDuration(duration: unknown): number | undefined {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration;
  if (typeof duration === 'string') {
    // archive.org durations are usually "mm:ss" or "hh:mm:ss" strings
    const parts = duration.split(':').map(Number);
    if (parts.every((n) => Number.isFinite(n))) {
      return parts.reduce((acc, n) => acc * 60 + n, 0);
    }
    const n = Number(duration);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
