import { EventSource } from 'eventsource';
import { ApiClient } from '../../api-client/api-client.js';

/** Server sends Mongo `_id`; normalize with `getDispatchId` before claim/complete APIs. */
export interface DispatchEvent {
  id?: string;
  _id?: string;
  topicId: string;
  eventType: string;
  skillName: string;
  createdAt: string;
  enrichedPayload?: unknown;
}

export interface PairingRotatedPayload {
  code: string;
  expiresAt: string;
}

export interface EventConsumerOptions {
  serverUrl: string;
  /** Bearer token: must be the active `executorToken` from `POST /api/v1/executors/register`. */
  token: string;
  onDispatch: (event: DispatchEvent) => void;
  onConnected: () => void;
  onDisconnected: (err?: Error) => void;
  onHeartbeat: (pendingCount: number) => void;
  /** Fired when the server rotated the pairing code (e.g. after exposure in a group chat). */
  onPairingRotated?: (payload: PairingRotatedPayload) => void;
}

export class EventConsumer {
  private es: EventSource | null = null;
  private readonly api: ApiClient;
  private closed = false;

  constructor(private readonly options: EventConsumerOptions) {
    this.api = new ApiClient(options.serverUrl);
    this.api.setToken(options.token);
  }

  async start(): Promise<void> {
    await this.catchUp();
    this.connectSse();
  }

  stop(): void {
    this.closed = true;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private async catchUp(): Promise<void> {
    try {
      const url = `/api/v1/dispatches?status=unclaimed&limit=50`;
      const data = await this.api.get<{ dispatches: DispatchEvent[] }>(url);
      for (const dispatch of data.dispatches) {
        this.options.onDispatch(dispatch);
      }
    } catch {
      // Catch-up failure is non-fatal; SSE will deliver new events
    }
  }

  private connectSse(): void {
    if (this.closed) return;

    const url = `${this.options.serverUrl}/api/v1/dispatches/stream`;
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
          if (data?.code && data?.expiresAt) {
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
    });
  }
}
