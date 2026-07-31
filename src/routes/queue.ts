import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ResolvePlayResult, RankedPlayOption } from '../modules/playback/orchestrator.js';

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const addSchema = z.object({
  songWorkId: z.string().min(1),
  sourceItemId: z.string().optional(),
  position: z.coerce.number().int().min(0).optional(),
  songWork: z.object({
    id: z.string(),
    title: z.string(),
    artists: z.string(),
  }),
});

const moveSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
});

const nextSchema = z.object({
  /** auto-start a play session after resolving (default true). */
  autoStart: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// types
// -----------------------------------------------------------------------------

interface QueueNextResult {
  queueItem: { id: string; songWorkId: string; sourceItemId?: string; songWork: { id: string; title: string; artists: string } };
  resolve: ResolvePlayResult;
  started: { playId: string; option: RankedPlayOption } | null;
}

// -----------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------

/**
 * Queue API — §六.
 *
 *   GET    /api/queue            — list current queue
 *   POST   /api/queue            — add songWorkId to queue
 *   DELETE /api/queue/:position  — remove item at 0-based position
 *   POST   /api/queue/next       — pop next + resolvePlay + optional autoStart
 *   POST   /api/queue/clear      — clear entire queue
 */
export async function queueRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/queue
  app.get('/api/queue', async () => {
    return app.queue.list();
  });

  // POST /api/queue
  app.post('/api/queue', async (req, reply) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const { item, isDuplicate } = app.queue.add(
      parsed.data.songWorkId,
      parsed.data.songWork,
      parsed.data.sourceItemId,
      parsed.data.position,
    );

    if (!isDuplicate) {
      app.wsHub.broadcast('queue', {
        type: 'queue:changed',
        action: 'add',
        songWorkId: parsed.data.songWorkId,
        total: app.queue.length,
      });
      return reply.status(201).send({ item, total: app.queue.length, duplicate: false });
    }

    return reply.status(200).send({ item, total: app.queue.length, duplicate: true });
  });

  // DELETE /api/queue/:position
  app.delete<{ Params: { position: string } }>('/api/queue/:position', async (req, reply) => {
    const pos = Number(req.params.position);
    if (!Number.isInteger(pos) || pos < 0) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'position must be a non-negative integer' },
      });
    }

    const removed = app.queue.removeAt(pos);
    if (!removed) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `no queue item at position ${pos}` },
      });
    }

    app.wsHub.broadcast('queue', {
      type: 'queue:changed',
      action: 'remove',
      position: pos,
      total: app.queue.length,
    });
    return { ok: true, total: app.queue.length };
  });

  // POST /api/queue/move
  app.post('/api/queue/move', async (req, reply) => {
    const parsed = moveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const moved = app.queue.move(parsed.data.from, parsed.data.to);
    if (!moved) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'invalid move positions' },
      });
    }

    app.wsHub.broadcast('queue', {
      type: 'queue:changed',
      action: 'move',
      from: parsed.data.from,
      to: parsed.data.to,
      total: app.queue.length,
    });
    return { ok: true, total: app.queue.length };
  });

  // POST /api/queue/next
  app.post('/api/queue/next', async (req, reply) => {
    const parsed = nextSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const item = app.queue.shift();
    if (!item) {
      return reply.status(404).send({
        error: { code: 'queue_empty', message: 'queue is empty' },
      });
    }

    // resolve play options for the next song
    const resolve = await app.playback.resolvePlay({
      songWorkId: item.songWorkId,
      sourceItemId: item.sourceItemId,
    });

    // optionally auto-start the best option
    let started: { playId: string; option: RankedPlayOption } | null = null;
    if (parsed.data.autoStart !== false && resolve.best) {
      try {
        const startResult = await app.playback.startPlay({
          sourceItemId: resolve.best.sourceItem.id,
          optionId: resolve.best.playableOptionId,
          trigger: 'queue',
        });
        started = { playId: startResult.playId, option: startResult.option };
      } catch {
        // autoStart failure is non-fatal — caller still gets resolve results
      }
    }

    const result: QueueNextResult = {
      queueItem: {
        id: item.id,
        songWorkId: item.songWorkId,
        sourceItemId: item.sourceItemId,
        songWork: item.songWork,
      },
      resolve,
      started,
    };

    app.wsHub.broadcast('queue', {
      type: 'queue:changed',
      action: 'next',
      songWorkId: item.songWorkId,
      total: app.queue.length,
    });

    return result;
  });

  // POST /api/queue/clear
  app.post('/api/queue/clear', async () => {
    const removed = app.queue.clear();
    app.wsHub.broadcast('queue', {
      type: 'queue:changed',
      action: 'clear',
      removed,
      total: 0,
    });
    return { ok: true, removed };
  });
}
