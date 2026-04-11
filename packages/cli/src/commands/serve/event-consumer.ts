import { EventSource } from 'eventsource';
import { ApiClient } from '../../api-client/api-client.js';

export interface DispatchEvent {
  id: string;
  topicId: string;
  eventType: string;
  skillName: string;
  createdAt: string;
}

export interface EventConsumerOptions {
  serverUrl: string;
  token: string;
  executorToken?: string;
  topichubUserId?: string;
  onDispatch: (event: DispatchEvent) => void;
  onConnected: () => void;
  onDisconnected: (err?: Error) => void;
  onHeartbeat: (pendingCount: number) => void;
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
      let url = `/api/v1/dispatches?status=unclaimed&limit=50`;
      if (this.options.topichubUserId) {
        url += `&targetUserId=${encodeURIComponent(this.options.topichubUserId)}`;
      }
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

    let url = `${this.options.serverUrl}/api/v1/dispatches/stream`;
    if (this.options.executorToken) {
      url += `?executorToken=${encodeURIComponent(this.options.executorToken)}`;
    } else if (this.options.topichubUserId) {
      url += `?targetUserId=${encodeURIComponent(this.options.topichubUserId)}`;
    }
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

    es.addEventListener('error', () => {
      this.options.onDisconnected(
        new Error('SSE connection error'),
      );
    });
  }
}
