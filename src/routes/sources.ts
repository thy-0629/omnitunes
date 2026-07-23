import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  KNOWN_SOURCE_IDS,
  type SourceError,
  type SourceId,
} from '../modules/sources/types.js';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Routes for inspecting and exercising the source registry.
 *
 *   GET /api/sources                 -> describe() + rollup stats
 *   GET /api/sources/health          -> live health snapshot for ALL sources
 *   GET /api/sources/:id/health      -> live health snapshot for one source
 *   GET /api/sources/:id/search      -> exercise a single source adapter
 */
export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sources', async () => ({
    sources: app.sources.describe(),
  }));

  app.get('/api/sources/health', async () => ({
    health: await app.sources.healthCheckAll(),
  }));

  app.get<{ Params: { id: string } }>('/api/sources/:id/health', async (req, reply) => {
    const id = parseSourceId(req.params.id);
    if (!id) return reply.notFound('unknown source id');
    const adapter = app.sources.get(id);
    if (!adapter) return reply.notFound('source not registered');
    return adapter.health();
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/sources/:id/search',
    async (req, reply) => {
      const id = parseSourceId(req.params.id);
      if (!id) return reply.notFound('unknown source id');
      const adapter = app.sources.get(id);
      if (!adapter) return reply.notFound('source not registered');

      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid query' } });
      }

      try {
        const hits = await app.sources.instrumentedSearch(id, {
          query: parsed.data.q,
          limit: parsed.data.limit,
        });
        return { source: id, query: parsed.data.q, hits };
      } catch (err) {
        if (isSourceError(err)) {
          return reply.status(502).send({
            error: {
              code: err.code,
              message: err.message,
              source: err.sourceId,
            },
          });
        }
        throw err;
      }
    },
  );
}

function parseSourceId(s: string): SourceId | null {
  return (KNOWN_SOURCE_IDS as readonly string[]).includes(s) ? (s as SourceId) : null;
}

function isSourceError(err: unknown): err is SourceError {
  return err instanceof Error && err.name === 'SourceError';
}