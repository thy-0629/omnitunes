import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ResolvePlayResult } from '../modules/playback/orchestrator.js';

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const addSchema = z.object({
  songWorkId: z.string().min(1),
  sourceItemId: z.string().optional(),
});

const nextSchema = z.object({
  /** auto-start a play session after resolving (default true). */
  autoStart: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// types
// -----------------------------------------------------------------------------

interface QueueNextResult {
  queueItem: { id: string; songWorkId: string; sourceItemId?: string };
  resolve: ResolvePlayResult;
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

    const item = app.queue.add(parsed.data.songWorkId, parsed.data.sourceItemId);
    return reply.status(201).send({ item, total: app.queue.length });
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
    if (parsed.data.autoStart !== false && resolve.best) {
      try {
        app.playback.startPlay({
          sourceItemId: resolve.best.sourceItem.id,
          optionId: resolve.best.playableOptionId,
          trigger: 'queue',
        });
      } catch {
        // autoStart failure is non-fatal — caller still gets resolve results
      }
    }

    const result: QueueNextResult = {
      queueItem: { id: item.id, songWorkId: item.songWorkId, sourceItemId: item.sourceItemId },
      resolve,
    };

    return result;
  });

  // POST /api/queue/clear
  app.post('/api/queue/clear', async () => {
    const removed = app.queue.clear();
    return { ok: true, removed };
  });
}
