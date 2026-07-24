import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { WebSocketHub } from './hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    wsHub: WebSocketHub;
  }
}

/**
 * Wire the WebSocket hub onto the app as `app.wsHub`.
 *
 * The hub itself is pure state — it manages connections and channels.
 * The @fastify/websocket plugin must be registered separately in app.ts
 * before the WS route is mounted.
 *
 * No dependencies — the hub is self-contained.
 */
export default fp(
  async (app: FastifyInstance) => {
    const hub = new WebSocketHub();
    hub.setLogger({
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
      error: (msg) => app.log.error(msg),
    });
    app.decorate('wsHub', hub);
    app.log.info('[ws] WebSocket hub ready');
  },
  { name: 'wsHub' },
);
