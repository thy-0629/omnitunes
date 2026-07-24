import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { collections, songWorks } from '../db/schema.js';
import { KNOWN_SOURCE_IDS, type SourceId } from '../modules/sources/types.js';

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const addSchema = z.object({
  songWorkId: z.string().min(1),
  preferredSource: z.string().optional(),
  preferredRecordingId: z.string().optional(),
});

const patchSchema = z.object({
  preferredSource: z.string().nullable().optional(),
  preferredRecordingId: z.string().nullable().optional(),
});

// -----------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------

/**
 * Collections (favorites) API — §八.
 *
 *   GET    /api/collections                 — list all favorites (join song_works)
 *   POST   /api/collections                 — add to favorites
 *   DELETE /api/collections/:songWorkId    — remove from favorites
 *   PATCH  /api/collections/:songWorkId    — update preferred source/recording
 */
export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/collections
  app.get('/api/collections', async () => {
    const rows = app.db
      .select({
        c: collections,
        sw: songWorks,
      })
      .from(collections)
      .innerJoin(songWorks, eq(collections.songWorkId, songWorks.id))
      .orderBy(collections.createdAt)
      .all();

    return {
      items: rows.map((r) => ({
        songWorkId: r.c.songWorkId,
        preferredSource: r.c.preferredSource,
        preferredRecordingId: r.c.preferredRecordingId,
        createdAt: r.c.createdAt,
        songWork: {
          id: r.sw.id,
          title: r.sw.title,
          artists: r.sw.artists,
        },
      })),
      total: rows.length,
    };
  });

  // POST /api/collections
  app.post('/api/collections', async (req, reply) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const d = parsed.data;

    // verify song work exists
    const sw = app.db.select().from(songWorks).where(eq(songWorks.id, d.songWorkId)).limit(1).get();
    if (!sw) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `song work not found: ${d.songWorkId}` },
      });
    }

    // check if already favorited
    const existing = app.db
      .select()
      .from(collections)
      .where(eq(collections.songWorkId, d.songWorkId))
      .limit(1)
      .get();
    if (existing) {
      return reply.status(409).send({
        error: { code: 'already_favorited', message: 'song work is already in favorites' },
      });
    }

    // validate preferredSource if provided
    let preferredSource: SourceId | null = null;
    if (d.preferredSource) {
      if (!(KNOWN_SOURCE_IDS as readonly string[]).includes(d.preferredSource)) {
        return reply.status(400).send({
          error: { code: 'validation_error', message: `unknown source: ${d.preferredSource}` },
        });
      }
      preferredSource = d.preferredSource as SourceId;
    }

    const created = app.db
      .insert(collections)
      .values({
        id: randomUUID(),
        songWorkId: d.songWorkId,
        preferredSource,
        preferredRecordingId: d.preferredRecordingId ?? null,
      })
      .returning()
      .get();

    return reply.status(201).send({
      collection: created,
      songWork: { id: sw.id, title: sw.title, artists: sw.artists },
    });
  });

  // DELETE /api/collections/:songWorkId
  app.delete<{ Params: { songWorkId: string } }>('/api/collections/:songWorkId', async (req, reply) => {
    const result = app.db
      .delete(collections)
      .where(eq(collections.songWorkId, req.params.songWorkId))
      .run();

    if (result.changes === 0) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'song work not in favorites' },
      });
    }

    return { ok: true };
  });

  // PATCH /api/collections/:songWorkId
  app.patch<{ Params: { songWorkId: string } }>('/api/collections/:songWorkId', async (req, reply) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const d = parsed.data;

    // verify it exists
    const existing = app.db
      .select()
      .from(collections)
      .where(eq(collections.songWorkId, req.params.songWorkId))
      .limit(1)
      .get();
    if (!existing) {
      return reply.status(404).send({
        error: { code: 'not_found', message: 'song work not in favorites' },
      });
    }

    // validate preferredSource if provided
    const updates: Record<string, unknown> = {};
    if (d.preferredSource !== undefined) {
      if (d.preferredSource !== null) {
        if (!(KNOWN_SOURCE_IDS as readonly string[]).includes(d.preferredSource)) {
          return reply.status(400).send({
            error: { code: 'validation_error', message: `unknown source: ${d.preferredSource}` },
          });
        }
      }
      updates.preferredSource = d.preferredSource;
    }
    if (d.preferredRecordingId !== undefined) {
      updates.preferredRecordingId = d.preferredRecordingId;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'no fields to update' },
      });
    }

    const updated = app.db
      .update(collections)
      .set(updates)
      .where(eq(collections.songWorkId, req.params.songWorkId))
      .returning()
      .get();

    return { collection: updated };
  });
}
