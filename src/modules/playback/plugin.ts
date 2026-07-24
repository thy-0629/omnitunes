import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PlaybackOrchestrator } from './orchestrator.js';

declare module 'fastify' {
  interface FastifyInstance {
    playback: PlaybackOrchestrator;
  }
}

/**
 * Wire the playback orchestrator onto the app as `app.playback`.
 *
 * Depends on `db` (playable_options + play_history persistence) and `sources`
 * (the registry for live getPlayOptions fan-out).
 */
export default fp(
  async (app: FastifyInstance) => {
    const orchestrator = new PlaybackOrchestrator(app.db, app.sources);
    app.decorate('playback', orchestrator);
    app.log.info('[playback] orchestrator ready');
  },
  { name: 'playback', dependencies: ['db', 'sources'] },
);
