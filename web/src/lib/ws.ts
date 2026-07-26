/**
 * WebSocket client — connects to /ws, auto-reconnects with backoff,
 * subscribes to all three channels on open, typed event emitter.
 */

export type WsChannel = 'playback' | 'queue' | 'progress';

export interface WsServerMessage {
  type: string;
  [key: string]: unknown;
}

type Handler = (msg: WsServerMessage) => void;

const CHANNELS: WsChannel[] = ['playback', 'queue', 'progress'];
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /** Current connection state, for UI indicators. */
  connected = false;
  private stateListeners = new Set<(connected: boolean) => void>();

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  on(type: string, handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onStateChange(listener: (connected: boolean) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  sendProgress(playId: string, positionSec: number, durationSec?: number): void {
    this.send({ type: 'progress', playId, positionSec, durationSec });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private connect(): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${window.location.host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.setConnected(true);
      for (const channel of CHANNELS) {
        this.send({ type: 'subscribe', channel });
      }
    };

    this.ws.onmessage = (ev) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as WsServerMessage;
      } catch {
        return;
      }
      const set = this.handlers.get(msg.type);
      if (set) for (const h of set) h(msg);
      const all = this.handlers.get('*');
      if (all) for (const h of all) h(msg);
    };

    this.ws.onclose = () => {
      this.setConnected(false);
      if (!this.started) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private setConnected(v: boolean): void {
    if (this.connected === v) return;
    this.connected = v;
    for (const l of this.stateListeners) l(v);
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WSClient();
