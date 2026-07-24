/**
 * WebSocketHub — §九.
 *
 * Manages WebSocket connections and channel-based pub/sub.
 *
 * Design:
 * - Each connection subscribes to channels (playback, queue, progress).
 * - The hub exposes `broadcast(channel, message)` which the route layer
 *   calls after mutating state (startPlay, queue.add, etc.).
 * - Progress sync: clients send `progress` messages; the hub relays them
 *   to all other subscribers on the `progress` channel (fan-out, no echo).
 *
 * The hub is pure in-process state — no Redis, no persistence.
 * Connections die on server restart (acceptable for MVP).
 */

import type { WebSocket } from 'ws';

// -----------------------------------------------------------------------------
// types
// -----------------------------------------------------------------------------

/** Channels a client can subscribe to. */
export type WsChannel = 'playback' | 'queue' | 'progress';

/** Message the server pushes to clients. */
export interface WsServerMessage {
  type:
    | 'play:started'
    | 'play:ended'
    | 'play:fallback'
    | 'queue:changed'
    | 'progress:sync'
    | 'connected'
    | 'subscribed'
    | 'unsubscribed'
    | 'error';
  [key: string]: unknown;
}

/** Message the client sends to the server. */
export interface WsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'progress';
  channel?: WsChannel;
  playId?: string;
  positionSec?: number;
  durationSec?: number;
}

// -----------------------------------------------------------------------------
// connection wrapper
// -----------------------------------------------------------------------------

interface ClientEntry {
  ws: WebSocket;
  channels: Set<WsChannel>;
}

const VALID_CHANNELS: readonly WsChannel[] = ['playback', 'queue', 'progress'];

// -----------------------------------------------------------------------------
// hub
// -----------------------------------------------------------------------------

export class WebSocketHub {
  private clients = new Map<WebSocket, ClientEntry>();
  private log?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  /** Inject a logger (called from plugin). */
  setLogger(log: typeof this.log): void {
    this.log = log;
  }

  // --- connection lifecycle --------------------------------------------------

  addClient(ws: WebSocket): void {
    this.clients.set(ws, { ws, channels: new Set() });
    this.log?.info(`[ws] client connected (total: ${this.clients.size})`);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
    this.log?.info(`[ws] client disconnected (total: ${this.clients.size})`);
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  // --- channel management ----------------------------------------------------

  subscribe(ws: WebSocket, channel: WsChannel): boolean {
    const entry = this.clients.get(ws);
    if (!entry) return false;
    entry.channels.add(channel);
    this.log?.info(`[ws] subscribed to "${channel}" (channels: ${[...entry.channels].join(', ')})`);
    return true;
  }

  unsubscribe(ws: WebSocket, channel: WsChannel): boolean {
    const entry = this.clients.get(ws);
    if (!entry) return false;
    entry.channels.delete(channel);
    this.log?.info(`[ws] unsubscribed from "${channel}"`);
    return true;
  }

  // --- messaging -------------------------------------------------------------

  /** Send a message to a single client. Silently drops if socket is not open. */
  send(ws: WebSocket, message: WsServerMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      this.log?.error(`[ws] send error: ${(err as Error).message}`);
    }
  }

  /**
   * Broadcast to all clients subscribed to `channel`.
   * Returns the number of clients that received the message.
   */
  broadcast(channel: WsChannel, message: WsServerMessage): number {
    let sent = 0;
    for (const entry of this.clients.values()) {
      if (entry.channels.has(channel)) {
        this.send(entry.ws, message);
        sent++;
      }
    }
    return sent;
  }

  /**
   * Broadcast to all clients subscribed to `channel`, EXCEPT the sender.
   * Used for progress sync — the sender doesn't need its own progress echoed back.
   */
  broadcastExcept(
    sender: WebSocket,
    channel: WsChannel,
    message: WsServerMessage,
  ): number {
    let sent = 0;
    for (const [ws, entry] of this.clients) {
      if (ws === sender) continue;
      if (entry.channels.has(channel)) {
        this.send(ws, message);
        sent++;
      }
    }
    return sent;
  }

  // --- parsing ---------------------------------------------------------------

  /** Parse and validate an incoming client message. Returns null if invalid. */
  static parseMessage(raw: string): WsClientMessage | null {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    if (typeof data !== 'object' || data === null) return null;
    const msg = data as Record<string, unknown>;

    switch (msg.type) {
      case 'subscribe':
      case 'unsubscribe': {
        const channel = msg.channel as unknown;
        if (typeof channel !== 'string') return null;
        if (!(VALID_CHANNELS as readonly string[]).includes(channel)) return null;
        return { type: msg.type, channel: channel as WsChannel };
      }
      case 'progress': {
        if (typeof msg.playId !== 'string') return null;
        if (typeof msg.positionSec !== 'number' || msg.positionSec < 0) return null;
        if (typeof msg.durationSec !== 'number' || msg.durationSec < 0) return null;
        return {
          type: 'progress',
          playId: msg.playId,
          positionSec: msg.positionSec,
          durationSec: msg.durationSec,
        };
      }
      default:
        return null;
    }
  }
}
