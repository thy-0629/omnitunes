import type { DbClient } from '../../db/client.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { SearchParams, SourceId } from '../sources/types.js';
import { Normalizer, type NormalizedEntry, type NormalizerInput } from './normalizer.js';

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

    return {
      query: params.query,
      totalSongWorks: bySongWork.size,
      results: [...bySongWork.values()],
      errors,
      meta: {
        searchedAt: start,
        sourcesQueried,
        latencyMs: Date.now() - start,
      },
    };
  }
}
