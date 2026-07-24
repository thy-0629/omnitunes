import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { KNOWN_SOURCE_IDS, type SourceId } from '../modules/sources/types.js';

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  /** comma-separated source filter, e.g. "mock,local". */
  sources: z.string().optional(),
});

/**
 * GET /api/search?q=&limit=&sources=
 *
 * Fan a query out to every search-capable source, normalize into the
 * five-layer model, and return one grouped result set.
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: Record<string, string> }>('/api/search', async (req, reply) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'validation_error',
          message: parsed.error.issues[0]?.message ?? 'invalid query',
        },
      });
    }

    const sources = parseSources(parsed.data.sources);
    if (sources === null) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'unknown source id in `sources` param' },
      });
    }

    const result = await app.search.search({
      query: parsed.data.q,
      limit: parsed.data.limit,
      sources: sources.length > 0 ? sources : undefined,
    });
    return result;
  });
}

/** Returns null on an unknown id, [] when the param is absent/empty. */
function parseSources(raw: string | undefined): SourceId[] | null {
  if (!raw) return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const valid: SourceId[] = [];
  for (const p of parts) {
    if ((KNOWN_SOURCE_IDS as readonly string[]).includes(p)) {
      valid.push(p as SourceId);
    } else {
      return null;
    }
  }
  return valid;
}
