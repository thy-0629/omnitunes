import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq, max, sql } from 'drizzle-orm';
import { playlists, playlistItems, songWorks, type Playlist } from '../db/schema.js';
import type { DbClient } from '../db/client.js';

/** Transaction type matching the better-sqlite3 sync transaction callback. */
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(200),
  visibility: z.enum(['private', 'shared']).optional(),
});

const patchPlaylistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  visibility: z.enum(['private', 'shared']).optional(),
}).refine((d) => d.name || d.visibility, { message: 'at least one field required' });

const addItemSchema = z.object({
  songWorkId: z.string().min(1),
  /** 0-based position. If omitted, appends to end. */
  position: z.number().int().min(0).optional(),
});

const moveItemSchema = z.object({
  /** new 0-based position. */
  position: z.number().int().min(0),
});

// -----------------------------------------------------------------------------
// helper: shift positions using ORDER BY to avoid unique-constraint conflicts
// -----------------------------------------------------------------------------

/** Offset used as a temporary range to avoid unique-constraint conflicts during shifts. */
const TEMP_OFFSET = 100000;

/** Shift items at or after `pos` up by 1 (two-step via temp range to avoid unique conflicts). */
function shiftUp(tx: Tx, playlistId: string, pos: number): void {
  // step 1: move affected items to high temp range
  tx.run(sql`UPDATE playlist_items SET position = position + ${TEMP_OFFSET}
             WHERE playlist_id = ${playlistId} AND position >= ${pos}`);
  // step 2: move them back to final position (original + 1)
  tx.run(sql`UPDATE playlist_items SET position = position - ${TEMP_OFFSET} + 1
             WHERE playlist_id = ${playlistId} AND position >= ${TEMP_OFFSET}`);
}

/** Shift items after `pos` down by 1 (two-step via temp range to avoid unique conflicts). */
function shiftDown(tx: Tx, playlistId: string, pos: number): void {
  // step 1: move affected items to high temp range
  tx.run(sql`UPDATE playlist_items SET position = position + ${TEMP_OFFSET}
             WHERE playlist_id = ${playlistId} AND position > ${pos}`);
  // step 2: move them back to final position (original - 1)
  tx.run(sql`UPDATE playlist_items SET position = position - ${TEMP_OFFSET} - 1
             WHERE playlist_id = ${playlistId} AND position >= ${TEMP_OFFSET}`);
}

// -----------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------

/**
 * Playlists API — §八.
 *
 *   GET    /api/playlists                       — list all playlists
 *   POST   /api/playlists                       — create playlist
 *   GET    /api/playlists/:id                   — get playlist + items
 *   PATCH  /api/playlists/:id                   — update name/visibility
 *   DELETE /api/playlists/:id                   — delete (cascade items)
 *   POST   /api/playlists/:id/items             — add song to playlist
 *   DELETE /api/playlists/:id/items/:itemId     — remove item
 *   PATCH  /api/playlists/:id/items/:itemId     — move item position
 */
export async function playlistRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/playlists
  app.get('/api/playlists', async () => {
    const rows = app.db.select().from(playlists).orderBy(playlists.createdAt).all();
    return { items: rows, total: rows.length };
  });

  // POST /api/playlists
  app.post('/api/playlists', async (req, reply) => {
    const parsed = createPlaylistSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const created = app.db
      .insert(playlists)
      .values({
        id: randomUUID(),
        name: parsed.data.name,
        visibility: parsed.data.visibility ?? 'private',
      })
      .returning()
      .get();

    return reply.status(201).send({ playlist: created });
  });

  // GET /api/playlists/:id
  app.get<{ Params: { id: string } }>('/api/playlists/:id', async (req, reply) => {
    const pl = app.db.select().from(playlists).where(eq(playlists.id, req.params.id)).limit(1).get();
    if (!pl) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist not found: ${req.params.id}` },
      });
    }

    const items = app.db
      .select({
        pi: playlistItems,
        sw: songWorks,
      })
      .from(playlistItems)
      .innerJoin(songWorks, eq(playlistItems.songWorkId, songWorks.id))
      .where(eq(playlistItems.playlistId, req.params.id))
      .orderBy(playlistItems.position)
      .all();

    return {
      playlist: pl,
      items: items.map((r) => ({
        id: r.pi.id,
        songWorkId: r.pi.songWorkId,
        position: r.pi.position,
        addedAt: r.pi.addedAt,
        songWork: { id: r.sw.id, title: r.sw.title, artists: r.sw.artists },
      })),
      total: items.length,
    };
  });

  // PATCH /api/playlists/:id
  app.patch<{ Params: { id: string } }>('/api/playlists/:id', async (req, reply) => {
    const parsed = patchPlaylistSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const existing = app.db.select().from(playlists).where(eq(playlists.id, req.params.id)).limit(1).get();
    if (!existing) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist not found: ${req.params.id}` },
      });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.visibility) updates.visibility = parsed.data.visibility;

    const updated = app.db
      .update(playlists)
      .set(updates)
      .where(eq(playlists.id, req.params.id))
      .returning()
      .get();

    return { playlist: updated };
  });

  // DELETE /api/playlists/:id
  app.delete<{ Params: { id: string } }>('/api/playlists/:id', async (req, reply) => {
    const result = app.db.delete(playlists).where(eq(playlists.id, req.params.id)).run();
    if (result.changes === 0) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist not found: ${req.params.id}` },
      });
    }
    return { ok: true };
  });

  // POST /api/playlists/:id/items
  app.post<{ Params: { id: string } }>('/api/playlists/:id/items', async (req, reply) => {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const d = parsed.data;

    // verify playlist exists
    const pl = app.db.select().from(playlists).where(eq(playlists.id, req.params.id)).limit(1).get() as Playlist | undefined;
    if (!pl) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist not found: ${req.params.id}` },
      });
    }

    // verify song work exists
    const sw = app.db.select().from(songWorks).where(eq(songWorks.id, d.songWorkId)).limit(1).get();
    if (!sw) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `song work not found: ${d.songWorkId}` },
      });
    }

    const created = app.db.transaction((tx) => {
      // determine position
      let pos: number;
      if (d.position !== undefined) {
        // shift existing items at or after this position up by 1
        shiftUp(tx, req.params.id, d.position);
        pos = d.position;
      } else {
        // append at end
        const maxRow = tx
          .select({ maxPos: max(playlistItems.position) })
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, req.params.id))
          .get();
        pos = (maxRow?.maxPos ?? -1) + 1;
      }

      return tx
        .insert(playlistItems)
        .values({
          id: randomUUID(),
          playlistId: req.params.id,
          songWorkId: d.songWorkId,
          position: pos,
        })
        .returning()
        .get();
    });

    return reply.status(201).send({
      item: created,
      songWork: { id: sw.id, title: sw.title, artists: sw.artists },
    });
  });

  // DELETE /api/playlists/:id/items/:itemId
  app.delete<{ Params: { id: string; itemId: string } }>('/api/playlists/:id/items/:itemId', async (req, reply) => {
    const item = app.db
      .select()
      .from(playlistItems)
      .where(and(eq(playlistItems.id, req.params.itemId), eq(playlistItems.playlistId, req.params.id)))
      .limit(1)
      .get();

    if (!item) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist item not found: ${req.params.itemId}` },
      });
    }

    app.db.transaction((tx) => {
      tx.delete(playlistItems).where(eq(playlistItems.id, req.params.itemId)).run();
      // shift items after this position down by 1
      shiftDown(tx, req.params.id, item.position);
    });

    return { ok: true };
  });

  // PATCH /api/playlists/:id/items/:itemId
  app.patch<{ Params: { id: string; itemId: string } }>('/api/playlists/:id/items/:itemId', async (req, reply) => {
    const parsed = moveItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const newPos = parsed.data.position;

    const item = app.db
      .select()
      .from(playlistItems)
      .where(and(eq(playlistItems.id, req.params.itemId), eq(playlistItems.playlistId, req.params.id)))
      .limit(1)
      .get();

    if (!item) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `playlist item not found: ${req.params.itemId}` },
      });
    }

    if (item.position === newPos) {
      return { item };
    }

    // count items to validate newPos
    const countRow = app.db
      .select({ count: sql<number>`count(*)` })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, req.params.id))
      .get();
    const maxPos = (countRow?.count ?? 0) - 1;
    if (newPos > maxPos) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: `position ${newPos} out of range (max ${maxPos})` },
      });
    }

    app.db.transaction((tx) => {
      const oldPos = item.position;
      // move the item to a higher temp range (2x offset) to avoid collision with shift range
      tx.run(sql`UPDATE playlist_items SET position = position + ${TEMP_OFFSET * 2}
                 WHERE id = ${req.params.itemId}`);

      if (newPos < oldPos) {
        // shift items in [newPos, oldPos-1] up by 1 (two-step via temp range)
        tx.run(sql`UPDATE playlist_items SET position = position + ${TEMP_OFFSET}
                   WHERE playlist_id = ${req.params.id} AND position >= ${newPos} AND position < ${oldPos}`);
        tx.run(sql`UPDATE playlist_items SET position = position - ${TEMP_OFFSET} + 1
                   WHERE playlist_id = ${req.params.id} AND position >= ${TEMP_OFFSET} AND position < ${TEMP_OFFSET * 2}`);
      } else {
        // shift items in [oldPos+1, newPos] down by 1 (two-step via temp range)
        tx.run(sql`UPDATE playlist_items SET position = position + ${TEMP_OFFSET}
                   WHERE playlist_id = ${req.params.id} AND position > ${oldPos} AND position <= ${newPos}`);
        tx.run(sql`UPDATE playlist_items SET position = position - ${TEMP_OFFSET} - 1
                   WHERE playlist_id = ${req.params.id} AND position >= ${TEMP_OFFSET} AND position < ${TEMP_OFFSET * 2}`);
      }

      // place item at new position
      tx.run(sql`UPDATE playlist_items SET position = ${newPos}
                 WHERE id = ${req.params.itemId}`);
    });

    const updated = app.db
      .select()
      .from(playlistItems)
      .where(eq(playlistItems.id, req.params.itemId))
      .get();

    return { item: updated };
  });
}
