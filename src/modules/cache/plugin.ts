import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config/env.js';
import { LruTtlCache, type LruTtlCacheStats } from './lru.js';
import { CachedUnifiedSearchService, CachedPlaybackOrchestrator, searchCacheKey, playOptCacheKey } from './layers.js';
import type { UnifiedSearchParams } from '../search/service.js';
import { Normalizer } from '../search/normalizer.js';
import { UnifiedSearchService, type UnifiedSearchResult } from '../search/service.js';
import { PlaybackOrchestrator, type ResolvePlayResult } from '../playback/orchestrator.js';

// --- type augmentation: replace the unmodified service/orchestrator types
//     with our cached wrappers. Both wrappers expose the same public methods
//     search(), startPlay() etc., so call sites in routes stay unchanged.
declare module 'fastify' {
  interface FastifyInstance {
    search: CachedUnifiedSearchService;
    playback: CachedPlaybackOrchestrator;
    cache: {
      invalidateSearch(query: string, sources?: string[], limit?: number): boolean;
      invalidateSourceItem(source: string, externalId: string): boolean;
      searchStats(): LruTtlCacheStats;
      playOptStats(): LruTtlCacheStats;
      clearAll(): void;
    };
  }
}

/**
 * §十一 — Online-first in-memory cache plugin.
 *
 * Mounts two LRU+TTL caches that wrap the existing search service and
 * playback orchestrator. Because the wrappers expose the same public method
 * surface, downstream route code does not need to change.
 */
export default fp(
  async (app: FastifyInstance) => {
    const normalizer = new Normalizer(app.db);
    const innerSearch = new UnifiedSearchService(app.sources, normalizer);
    const innerOrchestrator = new PlaybackOrchestrator(app.db, app.sources);

    const searchCache = new LruTtlCache<UnifiedSearchResult>({
      maxEntries: config.SEARCH_CACHE_MAX_ENTRIES,
      defaultTtlMs: config.SEARCH_CACHE_TTL_SEC * 1000,
    });

    const playOptCache = new LruTtlCache<Map<string, ResolvePlayResult>>({
      maxEntries: config.PLAY_OPTIONS_CACHE_MAX_ENTRIES,
      defaultTtlMs: config.PLAY_OPTIONS_CACHE_TTL_SEC * 1000,
    });

    app.decorate('search', new CachedUnifiedSearchService(innerSearch, searchCache));
    app.decorate('playback', new CachedPlaybackOrchestrator(innerOrchestrator, playOptCache));

    app.decorate('cache', {
      invalidateSearch(query, sources, limit) {
        const key = searchCacheKey({ query, sources: sources as UnifiedSearchParams['sources'], limit } as UnifiedSearchParams);
        return searchCache.delete(key);
      },
      invalidateSourceItem(source, externalId) {
        return playOptCache.delete(playOptCacheKey(source, externalId));
      },
      searchStats: () => searchCache.snapshot(),
      playOptStats: () => playOptCache.snapshot(),
      clearAll: () => {
        searchCache.clear();
        playOptCache.clear();
      },
    });

    // Background pruner — evicts expired keys periodically.
    const pruner = setInterval(() => {
      const r1 = searchCache.prune();
      const r2 = playOptCache.prune();
      if (r1 + r2 > 0) {
        app.log.debug({ prunedSearch: r1, prunedPlayOpt: r2 }, '[cache] pruned');
      }
    }, Math.min(60, Math.max(1, Math.floor(config.LIFECYCLE_INTERVAL_HOURS * 60))) * 60 * 1000);
    if (pruner.unref) pruner.unref();

    app.addHook('onClose', async () => {
      clearInterval(pruner);
      app.cache.clearAll();
    });

    app.log.info(
      {
        searchTtlSec: config.SEARCH_CACHE_TTL_SEC,
        searchMax: config.SEARCH_CACHE_MAX_ENTRIES,
        playOptTtlSec: config.PLAY_OPTIONS_CACHE_TTL_SEC,
        playOptMax: config.PLAY_OPTIONS_CACHE_MAX_ENTRIES,
      },
      '[cache] LRU+TTL layer mounted',
    );
  },
  { name: 'cache', dependencies: ['db', 'sources'] },
);
