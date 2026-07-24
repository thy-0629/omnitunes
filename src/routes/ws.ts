import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { WebSocketHub, type WsServerMessage } from '../modules/ws/hub.js';

/**
 * WebSocket endpoint — §九.
 *
 *   GET /ws   — upgrade to WebSocket, subscribe to channels, relay progress.
 *
 * Protocol:
 *
 *   Client → Server:
 *     { "type": "subscribe",   "channel": "playback|queue|progress" }
 *     { "type": "unsubscribe", "channel": "playback|queue|progress" }
 *     { "type": "progress", "playId": "xxx", "positionSec": 45.3, "durationSec": 180 }
 *
 *   Server → Client:
 *     { "type": "connected", "connectionId": "..." }
 *     { "type": "play:started", "playId": "...", "songWorkId": "...", "source": "local", "sourceItemId": "..." }
 *     { "type": "play:ended", "playId": "...", "outcome": "completed", "durationPlayedSec": 180 }
 *     { "type": "play:fallback", "oldPlayId": "...", "newPlayId": "...", "source": "youtube" }
 *     { "type": "queue:changed", "action": "add|remove|clear|next", "total": 3 }
 *     { "type": "progress:sync", "playId": "...", "positionSec": 45.3, "durationSec": 180 }
 *     { "type": "error", "message": "..." }
 */
export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    const hub = app.wsHub;

    // --- on connect ---
    hub.addClient(socket);

    const connectedMsg: WsServerMessage = {
      type: 'connected',
      connectionId: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channels: ['playback', 'queue', 'progress'],
    };
    hub.send(socket, connectedMsg);

    // --- on message ---
    socket.on('message', (raw: Buffer) => {
      const msg = WebSocketHub.parseMessage(raw.toString());

      if (!msg) {
        hub.send(socket, { type: 'error', message: 'invalid message format' });
        return;
      }

      switch (msg.type) {
        case 'subscribe': {
          hub.subscribe(socket, msg.channel!);
          hub.send(socket, { type: 'subscribed', channel: msg.channel });
          break;
        }
        case 'unsubscribe': {
          hub.unsubscribe(socket, msg.channel!);
          hub.send(socket, { type: 'unsubscribed', channel: msg.channel });
          break;
        }
        case 'progress': {
          // relay to all OTHER progress subscribers (no echo back to sender)
          hub.broadcastExcept(socket, 'progress', {
            type: 'progress:sync',
            playId: msg.playId!,
            positionSec: msg.positionSec!,
            durationSec: msg.durationSec!,
          });
          break;
        }
      }
    });

    // --- on disconnect ---
    socket.on('close', () => {
      hub.removeClient(socket);
    });

    // --- on error ---
    socket.on('error', (err: Error) => {
      app.log.error(`[ws] socket error: ${err.message}`);
      hub.removeClient(socket);
    });
  });

  // REST endpoint to inspect WS hub status (useful for debugging)
  app.get('/api/ws/status', async () => {
    return {
      connections: app.wsHub.connectionCount,
      channels: ['playback', 'queue', 'progress'] as const,
    };
  });
}
