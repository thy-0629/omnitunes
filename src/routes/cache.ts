import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config/env.js';

/**
 * §十一 — cache management routes.
 *
 * GET  /api/admin/cache/status         — snapshot of both LRU caches + config
 * POST /api/admin/cache/invalidate      — manually invalidate a single cache key
 * POST /api/admin/cache/clear           — wipe both caches
 */
export async function cacheRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/cache/status
  app.get('/api/admin/cache/status', async () => {
    return {
      search: app.cache.searchStats(),
      playOptions: app.cache.playOptStats(),
      config: {
        searchTtlSec: config.SEARCH_CACHE_TTL_SEC,
        searchMaxEntries: config.SEARCH_CACHE_MAX_ENTRIES,
        playOptTtlSec: config.PLAY_OPTIONS_CACHE_TTL_SEC,
        playOptMaxEntries: config.PLAY_OPTIONS_CACHE_MAX_ENTRIES,
      },
    };
  });

  // POST /api/admin/cache/invalidate
  app.post('/api/admin/cache/invalidate', async (req, reply) => {
    const parsed = z
      .object({
        kind: z.enum(['search', 'source-item']),
        query: z.string().min(1).optional(),
        limit: z.coerce.number().int().positive().optional(),
        sources: z.array(z.string()).optional(),
        source: z.string().min(1).optional(),
        externalId: z.string().min(1).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: 'validation_error', details: parsed.error.flatten() } });
    }

    const { kind } = parsed.data;
    if (kind === 'search') {
      if (!parsed.data.query) {
        return reply
          .status(400)
          .send({ error: { code: 'validation_error', message: 'query is required for kind=search' } });
      }
      const ok = app.cache.invalidateSearch(
        parsed.data.query,
        parsed.data.sources,
        parsed.data.limit,
      );
      return { ok, kind };
    }

    // kind === 'source-item'
    if (!parsed.data.source || !parsed.data.externalId) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'source + externalId required for kind=source-item' },
      });
    }
    const ok = app.cache.invalidateSourceItem(parsed.data.source, parsed.data.externalId);
    return { ok, kind };
  });

  // POST /api/admin/cache/clear
  app.post('/api/admin/cache/clear', async () => {
    app.cache.clearAll();
    return { ok: true };
  });
}
