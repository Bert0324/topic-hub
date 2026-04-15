import { EventSource } from 'eventsource';
import { NATIVE_INTEGRATION_SEGMENT } from '@topichub/core';
import {
  normalizeTopicHubServerRoot,
  postNativeGateway,
} from '../../api-client/native-gateway.js';

/** Server sends Mongo `_id`; normalize with `getDispatchId` before claim/complete APIs. */
export interface DispatchEvent {
  id?: string;
  _id?: string;
  topicId: string;
  eventType: string;
  skillName: string;
  createdAt: string;
  /** IM bridge channel (e.g. discord, feishu); used for per-platform completion limits. */
  sourcePlatform?: string;
  /** Survives claim/SSE when nested `enrichedPayload.event.payload` loses `topichubAgentOp`. */
  imAgentControlOp?: 'list' | 'create' | 'delete';
  enrichedPayload?: unknown;
}

export interface PairingRotatedPayload {
  code: string;
  expiresAt?: string;
}

export interface EventConsumerOptions {
  serverUrl: string;
  /** Bearer token: active `executorToken` from native gateway `executors.register`. */
  token: string;
  onDispatch: (event: DispatchEvent) => void;
  onConnected: () => void;
  onDisconnected: (err?: Error) => void;
  onHeartbeat: (pendingCount: number) => void;
  /** Fired when the server rotated the pairing code (e.g. after exposure in a group chat). */
  onPairingRotated?: (payload: PairingRotatedPayload) => void;
}

/** When `eventsource` fails the handshake (non-200, wrong content-type, …) it sets `readyState` to CLOSED and does not retry; we reconnect so `serve` keeps running. */
const SSE_RECONNECT_MS = 3_000;

/**
 * Delay before flipping the TUI to "disconnected" after SSE closes. Avoids a visible flash when
 * the socket drops and a new connection reaches `open` within this window (proxy blip / idle reset).
 */
const DISCONNECT_UI_DEBOUNCE_MS = 550;

/**
 * Poll interval for `dispatches.list` (Mongo-backed unclaimed rows for this executor).
 * Fills the gap when SSE `newDispatch` fires on a different server instance than the one
 * this client’s EventSource is connected to (e.g. FaaS multi-replica).
 * Set `TOPICHUB_DISPATCH_POLL_MS=0` to disable (SSE-only).
 */
const DEFAULT_DISPATCH_POLL_MS = 5_000;

/** Exported for `serve` status line and startup hints. */
export function getDispatchPollIntervalMs(): number {
  const raw = process.env.TOPICHUB_DISPATCH_POLL_MS?.trim();
  if (raw === '0') return 0;
  if (!raw) return DEFAULT_DISPATCH_POLL_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DISPATCH_POLL_MS;
  if (n === 0) return 0;
  return Math.max(2_000, n);
}

export class EventConsumer {
  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private disconnectUiTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private pollInFlight = false;
  private closed = false;

  constructor(private readonly options: EventConsumerOptions) {}

  async start(): Promise<void> {
    this.connectSse();
    const pollMs = getDispatchPollIntervalMs();
    if (pollMs > 0) {
      this.pollTimer = setInterval(() => {
        void this.pollUnclaimedFromMongo();
      }, pollMs);
      (this.pollTimer as NodeJS.Timeout).unref?.();
    }
  }

  stop(): void {
    this.closed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.disconnectUiTimer) {
      clearTimeout(this.disconnectUiTimer);
      this.disconnectUiTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  /**
   * Lists unclaimed dispatches for this executor from Mongo (any API instance).
   * Safe to call from timers or SSE `heartbeat` (dedupe in `serve` prevents double work).
   */
  async pollDispatchBacklog(): Promise<void> {
    return this.pollUnclaimedFromMongo();
  }

  /** Lists unclaimed dispatches for this executor from Mongo (any API instance). */
  private async pollUnclaimedFromMongo(): Promise<void> {
    if (this.closed || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const data = await postNativeGateway<{ dispatches?: DispatchEvent[] }>(
        this.options.serverUrl,
        'dispatches.list',
        { status: 'unclaimed', limit: 50 },
        { authorization: this.options.token },
      );
      const list = Array.isArray(data.dispatches) ? data.dispatches : [];
      for (const dispatch of list) {
        if (dispatch && typeof dispatch === 'object') {
          this.options.onDispatch(dispatch);
        }
      }
    } catch (err) {
      console.warn(
        '[topic-hub serve] dispatches.list poll failed:',
        err instanceof Error ? err.message : err,
      );
    } finally {
      this.pollInFlight = false;
    }
  }

  private connectSse(): void {
    if (this.closed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.disconnectUiTimer) {
      clearTimeout(this.disconnectUiTimer);
      this.disconnectUiTimer = undefined;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }

    const root = normalizeTopicHubServerRoot(this.options.serverUrl.replace(/\/+$/, ''));
    const url = `${root}/${NATIVE_INTEGRATION_SEGMENT}/stream`;
    const es = new EventSource(url, {
      fetch: (input: any, init?: any) =>
        fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${this.options.token}`,
          },
        }),
    });
    this.es = es;

    es.addEventListener('open', () => {
      if (this.disconnectUiTimer) {
        clearTimeout(this.disconnectUiTimer);
        this.disconnectUiTimer = undefined;
      }
      void (async () => {
        await this.pollUnclaimedFromMongo();
        this.options.onConnected();
      })();
    });

    es.addEventListener('dispatch', ((evt: any) => {
      try {
        const data = JSON.parse(evt.data) as DispatchEvent;
        this.options.onDispatch(data);
      } catch {
        // Malformed event — skip
      }
    }) as any);

    es.addEventListener('heartbeat', ((evt: any) => {
      try {
        const data = JSON.parse(evt.data) as { pendingCount?: number };
        this.options.onHeartbeat(data.pendingCount ?? 0);
      } catch {
        // Ignore
      }
    }) as any);

    if (this.options.onPairingRotated) {
      const cb = this.options.onPairingRotated;
      es.addEventListener('pairing_rotated', ((evt: MessageEvent) => {
        try {
          const data = JSON.parse(String(evt.data)) as PairingRotatedPayload;
          if (data?.code) {
            cb(data);
          }
        } catch {
          // Malformed event — skip
        }
      }) as any);
    }

    es.addEventListener('error', () => {
      if (this.closed) return;
      // Transient errors use the library's internal CONNECTING + timer; permanent handshake failures leave CLOSED.
      queueMicrotask(() => {
        if (this.closed) return;
        if (this.es !== es || es.readyState !== EventSource.CLOSED) return;
        this.es = null;
        clearTimeout(this.disconnectUiTimer);
        this.disconnectUiTimer = setTimeout(() => {
          this.disconnectUiTimer = undefined;
          if (this.closed) return;
          const cur = this.es;
          if (cur != null && cur.readyState === EventSource.OPEN) return;
          this.options.onDisconnected(new Error('SSE connection error'));
        }, DISCONNECT_UI_DEBOUNCE_MS);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connectSse();
        }, SSE_RECONNECT_MS);
      });
    });
  }
}
