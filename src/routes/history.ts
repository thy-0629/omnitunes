import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { playHistory, songWorks } from '../db/schema.js';
import { KNOWN_SOURCE_IDS, type SourceId } from '../modules/sources/types.js';

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const historyListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  source: z.string().optional(),
});

// -----------------------------------------------------------------------------
// types
// -----------------------------------------------------------------------------

interface HistoryEntry {
  id: string;
  songWorkId: string;
  songWorkTitle: string;
  songWorkArtists: string;
  source: string;
  sourceItemId: string | null;
  trigger: string;
  outcome: string;
  durationPlayedSec: number | null;
  fallbackFromId: string | null;
  playedAt: number;
}

// -----------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------

/**
 * History API — §六 (read side).
 *
 *   GET /api/history                — paginated play history (newest first)
 *   GET /api/history/:songWorkId    — all plays for a specific song work
 */
export async function historyRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/history?limit=20&offset=0&source=mock
  app.get<{ Querystring: Record<string, string> }>('/api/history', async (req, reply) => {
    const parsed = historyListSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
    }

    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;

    let sourceFilter: SourceId | undefined;
    if (parsed.data.source) {
      if (!(KNOWN_SOURCE_IDS as readonly string[]).includes(parsed.data.source)) {
        return reply.status(400).send({
          error: { code: 'validation_error', message: `unknown source: ${parsed.data.source}` },
        });
      }
      sourceFilter = parsed.data.source as SourceId;
    }

    const rows = app.db
      .select({
        h: playHistory,
        sw: songWorks,
      })
      .from(playHistory)
      .innerJoin(songWorks, eq(playHistory.songWorkId, songWorks.id))
      .orderBy(desc(playHistory.playedAt))
      .limit(limit)
      .offset(offset)
      .all();

    const filtered = sourceFilter
      ? rows.filter((r) => r.h.source === sourceFilter)
      : rows;

    const entries: HistoryEntry[] = filtered.map((r) => ({
      id: r.h.id,
      songWorkId: r.h.songWorkId,
      songWorkTitle: r.sw.title,
      songWorkArtists: r.sw.artists,
      source: r.h.source,
      sourceItemId: r.h.sourceItemId,
      trigger: r.h.trigger,
      outcome: r.h.outcome,
      durationPlayedSec: r.h.durationPlayedSec,
      fallbackFromId: r.h.fallbackFromId,
      playedAt: r.h.playedAt,
    }));

    return {
      items: entries,
      total: entries.length,
      limit,
      offset,
    };
  });

  // GET /api/history/:songWorkId
  app.get<{ Params: { songWorkId: string } }>('/api/history/:songWorkId', async (req, reply) => {
    // verify song work exists
    const sw = app.db
      .select()
      .from(songWorks)
      .where(eq(songWorks.id, req.params.songWorkId))
      .limit(1)
      .get();

    if (!sw) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `song work not found: ${req.params.songWorkId}` },
      });
    }

    const rows = app.db
      .select()
      .from(playHistory)
      .where(eq(playHistory.songWorkId, req.params.songWorkId))
      .orderBy(desc(playHistory.playedAt))
      .all();

    return {
      songWork: {
        id: sw.id,
        title: sw.title,
        artists: sw.artists,
      },
      items: rows,
      total: rows.length,
    };
  });
}
