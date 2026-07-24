import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PlayQueue } from './queue.js';

declare module 'fastify' {
  interface FastifyInstance {
    queue: PlayQueue;
  }
}

/**
 * Wire the in-memory play queue onto the app as `app.queue`.
 *
 * No dependencies — pure in-process state, survives across requests
 * but is lost on server restart (MVP trade-off).
 */
export default fp(
  async (app: FastifyInstance) => {
    const queue = new PlayQueue();
    app.decorate('queue', queue);
    app.log.info('[queue] in-memory play queue ready');
  },
  { name: 'queue' },
);
