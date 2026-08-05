/**
 * §十一 cache layer — search + play-options accelerators.
 *
 * Two thin wrappers that mirror the public method surface of the underlying
 * service / orchestrator, but add LRU+TTL caching on top. The wrappers
 * delegate to the originals on cache miss — that's the "online-first" guarantee
 * baked in: a cache miss is always silently followed by a live fetch.
 *
 * Cache key strategies:
 *   - searchCacheKey()    → "search:" + sha1(normalised params)
 *   - playOptCacheKey()   → "playopt:" + sha1(source + "|" + externalId)
 *
 * Hashing the params (vs. toString'ing them) means parameter ordering and
 * casing can't produce duplicate keys.
 *
 * Failure isolation:
 *   - If a cached entry is itself a Result with errors, we still serve it —
 *     we don't want stale success data either. Cache stores the full return
 *     value (results + errors + meta + latencyMs are all reconstructed
 *     identically because the underlying call is deterministic per
 *     (query, sources, limit)).
 *   - Wrappers never throw "cache errors". A cache miss / eviction is silent,
 *     and falls through to a live call.
 *
 * Why this lives at the cache module boundary and not inside service.ts:
 *   - service.ts is §四. Touching it pulls §四 churn forward. Keeping the
 *     wrapper here means §十一 is purely additive.
 *   - If we ever need to disable caching (offline mode, debugging), just
 *     don't mount cachePlugin. No code change required.
 */
import { createHash } from 'node:crypto';
import type { UnifiedSearchService, UnifiedSearchParams, UnifiedSearchResult } from '../search/service.js';
import type { PlaybackOrchestrator, ResolvePlayRequest, ResolvePlayResult } from '../playback/orchestrator.js';
import type { PlayabilityVerifier } from '../sources/playability.js';
import { LruTtlCache } from './lru.js';

/** Stable hash-based key (deterministic, ignores key-iteration order). */
export function searchCacheKey(p: UnifiedSearchParams): string {
  const q = p.query.trim().toLowerCase();
  const lim = p.limit ?? 0;
  const src = p.sources === undefined
    ? '__all__'
    : p.sources.length === 0
      ? '__none__'
      : p.sources.slice().sort().join(',');
  const input = `search|${q}|${lim}|${src}`;
  return `search:${createHash('sha1').update(input).digest('hex').slice(0, 16)}`;
}

export function playOptCacheKey(source: string, externalId: string): string {
  return `playopt:${source}|${externalId}`;
}

/** Decorator: wraps a UnifiedSearchService with an LRU+TTL cache. */
export class CachedUnifiedSearchService {
  private readonly unsubscribeUnavailable?: () => void;
  private invalidationGeneration = 0;

  constructor(
    private readonly inner: UnifiedSearchService,
    private readonly cache: LruTtlCache<UnifiedSearchResult>,
    verifier?: PlayabilityVerifier,
  ) {
    this.unsubscribeUnavailable = verifier?.onUnavailable(() => this.clear());
  }

  get stats() {
    return this.cache.snapshot();
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.invalidationGeneration += 1;
    this.cache.clear();
  }

  close(): void {
    this.unsubscribeUnavailable?.();
  }

  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const key = searchCacheKey(params);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      return { ...hit, meta: { ...hit.meta, latencyMs: 0 } };
    }
    const generation = this.invalidationGeneration;
    const result = await this.inner.search(params);
    if (generation === this.invalidationGeneration) {
      this.cache.set(key, result);
    }
    return result;
  }
}

/** Decorator: caches resolvePlay() results per source-item. */
export class CachedPlaybackOrchestrator {
  constructor(
    private readonly inner: PlaybackOrchestrator,
    private readonly cache: LruTtlCache<Map<string, ResolvePlayResult>>,
  ) {}

  get stats() {
    return this.cache.snapshot();
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  async resolvePlay(req: ResolvePlayRequest): Promise<ResolvePlayResult> {
    // Only cache the "single source-item" path — that's the hot path for
    // imperatively-resolved previews. Multi-item requests (recording/songWork)
    // are rare and include stateful preferredSource, so we skip them.
    if (!req.sourceItemId) {
      return this.inner.resolvePlay(req);
    }
    const key = playOptCacheKey('__by-id__', req.sourceItemId);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      // Cache stores a map: sourceItemId -> result. But for the single
      // source-item case, we store a 1-entry map.
      const result = hit.get(req.sourceItemId);
      if (result) return result;
    }

    const result = await this.inner.resolvePlay(req);
    // Only cache "successful" results — if all options failed, retry next call.
    if (result.options.length > 0) {
      const map = new Map<string, ResolvePlayResult>();
      map.set(req.sourceItemId, result);
      this.cache.set(key, map);
    }
    return result;
  }

  startPlay(...args: Parameters<PlaybackOrchestrator['startPlay']>) {
    // Mutations to play_history happen here — never cache. The caller still
    // gets whatever the underlying orchestrator returns.
    return this.inner.startPlay(...args);
  }

  endPlay(...args: Parameters<PlaybackOrchestrator['endPlay']>) {
    return this.inner.endPlay(...args);
  }

  async fallback(...args: Parameters<PlaybackOrchestrator['fallback']>) {
    try {
      return await this.inner.fallback(...args);
    } finally {
      // A runtime playback failure changes verifier and persisted availability
      // state. Drop cached resolve results even when no alternate is found so
      // the failed option cannot be re-emitted by this wrapper.
      this.cache.clear();
    }
  }
}
