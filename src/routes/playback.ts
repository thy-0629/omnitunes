import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { KNOWN_SOURCE_IDS, type SourceId } from '../modules/sources/types.js';
import { PlayError } from '../modules/playback/orchestrator.js';

// -----------------------------------------------------------------------------
// schemas
// -----------------------------------------------------------------------------

const resolveSchema = z.object({
  songWorkId: z.string().optional(),
  recordingId: z.string().optional(),
  sourceItemId: z.string().optional(),
  preferredSource: z.string().optional(),
}).refine(
  (d) => d.songWorkId || d.recordingId || d.sourceItemId,
  { message: 'at least one of songWorkId, recordingId, sourceItemId is required' },
);

const startSchema = z.object({
  sourceItemId: z.string().min(1),
  optionId: z.string().optional(),
  trigger: z.enum(['manual', 'queue', 'autoplay']).optional(),
});

const endSchema = z.object({
  outcome: z.enum(['completed', 'skipped', 'failed']),
  durationPlayedSec: z.number().nonnegative().optional(),
});

const fallbackSchema = z.object({
  reason: z.string().min(1).max(500),
});

// -----------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------

/**
 * Playback API — §五.
 *
 *   POST /api/play/resolve     — resolve + rank all play options
 *   POST /api/play/start        — begin a play session (creates play_history)
 *   POST /api/play/:playId/end  — finalise a play session
 *   POST /api/play/:playId/fallback — auto-switch to next best option
 */
export async function playbackRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/play/resolve
  app.post('/api/play/resolve', async (req, reply) => {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    const d = parsed.data;
    let preferredSource: SourceId | undefined;
    if (d.preferredSource) {
      if (!(KNOWN_SOURCE_IDS as readonly string[]).includes(d.preferredSource)) {
        return reply.status(400).send({
          error: { code: 'validation_error', message: `unknown source: ${d.preferredSource}` },
        });
      }
      preferredSource = d.preferredSource as SourceId;
    }

    const result = await app.playback.resolvePlay({
      songWorkId: d.songWorkId,
      recordingId: d.recordingId,
      sourceItemId: d.sourceItemId,
      preferredSource,
    });
    return result;
  });

  // POST /api/play/start
  app.post('/api/play/start', async (req, reply) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    try {
      const result = app.playback.startPlay({
        sourceItemId: parsed.data.sourceItemId,
        optionId: parsed.data.optionId,
        trigger: parsed.data.trigger,
      });
      // broadcast play:started to all WS clients on the playback channel
      app.wsHub.broadcast('playback', {
        type: 'play:started',
        playId: result.playId,
        source: result.option.source,
        sourceItemId: result.option.sourceItem.id,
        optionType: result.option.option.type,
      });
      return result;
    } catch (err) {
      return mapPlayError(reply, err);
    }
  });

  // POST /api/play/:playId/end
  app.post<{ Params: { playId: string } }>('/api/play/:playId/end', async (req, reply) => {
    const parsed = endSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    try {
      const result = app.playback.endPlay(req.params.playId, {
        outcome: parsed.data.outcome,
        durationPlayedSec: parsed.data.durationPlayedSec,
      });
      // broadcast play:ended to all WS clients on the playback channel
      app.wsHub.broadcast('playback', {
        type: 'play:ended',
        playId: req.params.playId,
        outcome: parsed.data.outcome,
        durationPlayedSec: parsed.data.durationPlayedSec ?? null,
      });
      return result;
    } catch (err) {
      return mapPlayError(reply, err);
    }
  });

  // POST /api/play/:playId/fallback
  app.post<{ Params: { playId: string } }>('/api/play/:playId/fallback', async (req, reply) => {
    const parsed = fallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
    }

    try {
      const result = await app.playback.fallback(req.params.playId, { reason: parsed.data.reason });
      // broadcast play:fallback to all WS clients on the playback channel
      app.wsHub.broadcast('playback', {
        type: 'play:fallback',
        oldPlayId: req.params.playId,
        newPlayId: result.playId,
        source: result.option.source,
        sourceItemId: result.option.sourceItem.id,
      });
      return result;
    } catch (err) {
      return mapPlayError(reply, err);
    }
  });
}

function mapPlayError(reply: FastifyReply, err: unknown) {
  if (err instanceof PlayError) {
    return reply.status(400).send({ error: { code: err.code, message: err.message } });
  }
  return reply.status(500).send({ error: { code: 'internal_error', message: 'unexpected playback error' } });
}
