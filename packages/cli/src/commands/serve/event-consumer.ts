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

export class EventConsumer {
  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(private readonly options: EventConsumerOptions) {}

  async start(): Promise<void> {
    await this.catchUp();
    this.connectSse();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private async catchUp(): Promise<void> {
    try {
      const data = await postNativeGateway<{ dispatches: DispatchEvent[] }>(
        this.options.serverUrl,
        'dispatches.list',
        { status: 'unclaimed', limit: 50 },
        { authorization: this.options.token },
      );
      for (const dispatch of data.dispatches) {
        this.options.onDispatch(dispatch);
      }
    } catch {
      // Catch-up failure is non-fatal; SSE will deliver new events
    }
  }

  private connectSse(): void {
    if (this.closed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
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
      this.options.onConnected();
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
      this.options.onDisconnected(
        new Error('SSE connection error'),
      );
      if (this.closed) return;
      // Transient errors use the library's internal CONNECTING + timer; permanent handshake failures leave CLOSED.
      queueMicrotask(() => {
        if (this.closed) return;
        if (this.es !== es || es.readyState !== EventSource.CLOSED) return;
        this.es = null;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connectSse();
        }, SSE_RECONNECT_MS);
      });
    });
  }
}
