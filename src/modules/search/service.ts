import type { DbClient } from '../../db/client.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { SearchParams, SourceId } from '../sources/types.js';
import { Normalizer, canonicalTitle, type NormalizedEntry, type NormalizerInput } from './normalizer.js';

const NOISE_ENGLISH = /\b(vlog|review|reaction|gaming|gameplay|commentary|podcast|asmr|tutorial|travel|trip|journey|tour|mock|playlist|medley|mashup|drum cover|cover by)\b/i;
const NOISE_CHINESE = /(合集|歌单|精选|动态鼓谱|游戏|解说|纪录片|游记|旅行| tours?|vlog|reaction|review|mock)/i;

function isNoiseTitle(title: string): boolean {
  return NOISE_ENGLISH.test(title) || NOISE_CHINESE.test(title);
}

export interface UnifiedSearchParams extends SearchParams {
  /** restrict the fan-out to these sources; undefined = all search-capable adapters. */
  sources?: SourceId[];
}

export interface SearchResultGroup {
  songWork: NormalizedEntry['songWork'];
  recordings: Array<{
    recording: NormalizedEntry['recording'];
    sourceItems: NormalizedEntry['sourceItem'][];
  }>;
}

export interface SearchError {
  source: SourceId;
  code: string;
  message: string;
}

export interface UnifiedSearchResult {
  query: string;
  totalSongWorks: number;
  results: SearchResultGroup[];
  errors: SearchError[];
  meta: {
    searchedAt: number;
    sourcesQueried: SourceId[];
    latencyMs: number;
    relevanceRanked?: boolean;
  };
}

/**
 * UnifiedSearchService — the §四 orchestration layer.
 *
 * Fan out a search to every enabled, search-capable adapter concurrently,
 * normalize the raw hits into the shared five-layer model, and group them
 * back by SongWork so the client gets one coherent result set regardless of
 * how many sources actually answered.
 *
 * Design rules:
 *   - Online-first (the "在線優先"铁律): every search hits the adapters live.
 *     Caching is §十一 and is intentionally NOT done here.
 *   - Partial failure is fine: one source erroring must never blank the whole
 *     result. We use Promise.allSettled and collect failures into `errors[]`.
 *   - No download / no track extraction (project铁律). We only ever resolve
 *     playability via the adapter contract; the actual stream endpoint is §七.
 */
export class UnifiedSearchService {
  constructor(
    private readonly registry: SourceRegistry,
    private readonly normalizer: Normalizer,
  ) {}

  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const start = Date.now();

    const adapters = this.registry
      .list()
      .filter(
        (a) => a.capabilities.search && (!params.sources || params.sources.includes(a.id)),
      );
    const sourcesQueried = adapters.map((a) => a.id);

    // concurrent fan-out — a single source failing must not break the others
    const settled = await Promise.allSettled(
      adapters.map((a) =>
        this.registry.instrumentedSearch(a.id, { query: params.query, limit: params.limit }),
      ),
    );

    const errors: SearchError[] = [];
    const inputs: NormalizerInput[] = [];
    settled.forEach((res, i) => {
      const id = sourcesQueried[i]!;
      if (res.status === 'fulfilled') {
        for (const hit of res.value) inputs.push({ sourceId: id, hit });
      } else {
        const err = res.reason as { code?: string; message?: string } | undefined;
        errors.push({
          source: id,
          code: err?.code ?? 'unknown',
          message: err?.message ?? String(res.reason),
        });
      }
    });

    const entries = await this.normalizer.normalizeAll(inputs);

    // group normalized entries by SongWork -> Recording -> SourceItem[]
    const bySongWork = new Map<string, SearchResultGroup>();
    for (const e of entries) {
      let group = bySongWork.get(e.songWork.id);
      if (!group) {
        group = { songWork: e.songWork, recordings: [] };
        bySongWork.set(e.songWork.id, group);
      }
      let rec = group.recordings.find((r) => r.recording.id === e.recording.id);
      if (!rec) {
        rec = { recording: e.recording, sourceItems: [] };
        group.recordings.push(rec);
      }
      rec.sourceItems.push(e.sourceItem);
    }

    const query = params.query.trim();
    const queryClean = canonicalTitle(query);
    const ranked = [...bySongWork.values()]
      .map((group) => ({
        group,
        score: scoreGroup(group, query, queryClean),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.group);

    const limit = Math.max(1, params.limit ?? 20);
    const trimmed = ranked.slice(0, limit);

    return {
      query,
      totalSongWorks: bySongWork.size,
      results: trimmed,
      errors,
      meta: {
        searchedAt: start,
        sourcesQueried,
        latencyMs: Date.now() - start,
        relevanceRanked: true,
      },
    };
  }
}

export function scoreGroup(
  group: SearchResultGroup,
  query: string,
  queryClean: string,
): number {
  const titleClean = canonicalTitle(group.songWork.title);
  const titleLower = group.songWork.title.toLowerCase();
  const queryLower = query.toLowerCase();
  let score = 0;

  const exactTitle = queryClean.length > 0 && titleClean === queryClean;
  if (exactTitle) {
    // This text-match tier deliberately exceeds every possible quality bonus.
    score += 200;
  } else if (titleClean.includes(queryClean) && queryClean.length >= 2) {
    score += 80;
  } else if (queryClean.includes(titleClean) && titleClean.length >= 2) {
    score += 30;
  }

  // strongest signal: raw title contains the query (handles "歌手《歌名》" / "歌手 - 歌名 MV")
  if (!exactTitle && queryLower.length > 0 && titleLower.includes(queryLower)) {
    score += 40;
  }

  const artistLower = group.songWork.artists.toLowerCase();
  const artistTokens = new Set(queryLower.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  let matchingArtistTokens = 0;
  for (const token of artistTokens) {
    if (artistLower.includes(token)) {
      matchingArtistTokens += 1;
      score += 24;
    }
  }
  if (matchingArtistTokens > 0 && titleClean.length >= 2 && queryClean.includes(titleClean)) {
    score += 60;
  }

  // distinct sources bonus, capped so playlists don't dominate real songs
  const sources = new Set<SourceId>();
  for (const rec of group.recordings) {
    for (const si of rec.sourceItems) {
      sources.add(si.source as SourceId);
    }
  }
  score += Math.min(sources.size, 2) * 10;

  // duration presence bonus
  if (group.recordings.some((r) => r.recording.durationSec != null)) {
    score += 5;
  }

  // noise penalty
  if (isNoiseTitle(group.songWork.title)) {
    score -= 50;
  }

  score += bestSourceQualityBonus(group);

  return score;
}

function bestSourceQualityBonus(group: SearchResultGroup): number {
  let best = 0;
  for (const recording of group.recordings) {
    for (const sourceItem of recording.sourceItems) {
      const quality = sourceItem.qualityMetadata;
      if (!quality) continue;
      const popularity = Math.min(
        12,
        Math.log10(Math.max(0, quality.playCount ?? 0) + 1) * 2 +
          Math.log10(Math.max(0, quality.interactionCount ?? 0) + 1),
      );
      const sourceQuality = Math.min(20, popularity + (quality.isOfficialPublisher ? 4 : 0));
      best = Math.max(best, sourceQuality);
    }
  }
  return best;
}
