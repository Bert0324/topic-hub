import type { PairingRotatedPayload } from '../identity/identity.service';

/** One SSE frame for Nest `@Sse()` / EventSource-style consumers. */
export type ExecutorSseEvent = { type?: string; data: string };

/** Narrow hub surface for the executor task stream (no Nest / RxJS). */
export type ExecutorTaskSseHub = {
  identityAuth: {
    requireExecutor(
      headers: Record<string, string | string[] | undefined>,
    ): Promise<{ identityId: string; executorToken: string }>;
  };
  dispatch: {
    onTask(listener: (task: unknown) => void): () => void;
    /** Mongo-backed listing for executor-scoped UNCLAIMED rows (used for cross-pod polling). */
    list(filters: { executorToken: string; limit?: number }): Promise<unknown[]>;
  };
  identity: {
    subscribePairingRotations(
      executorToken: string,
      handler: (payload: PairingRotatedPayload) => void,
    ): () => void;
  };
};

export type ExecutorTaskSseOptions = {
  /** Interval between synthetic `heartbeat` frames (milliseconds). */
  heartbeatIntervalMs: number;
  /**
   * Poll interval for UNCLAIMED dispatches in Mongo (cross-pod / FaaS where in-memory emit is not shared).
   * `0` disables. Default: env `TOPICHUB_EXECUTOR_SSE_UNCLAIMED_POLL_MS` or `3000`.
   */
  unclaimedPollIntervalMs?: number;
};

function resolveUnclaimedPollIntervalMs(options: ExecutorTaskSseOptions): number {
  if (options.unclaimedPollIntervalMs !== undefined) {
    return options.unclaimedPollIntervalMs;
  }
  const raw =
    typeof process !== 'undefined' ? process.env.TOPICHUB_EXECUTOR_SSE_UNCLAIMED_POLL_MS?.trim() : '';
  if (raw === '0') return 0;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 3_000;
}

function dispatchDocIdString(task: unknown): string {
  const t = task as { _id?: unknown };
  if (t?._id == null) return '';
  if (typeof t._id === 'string') return t._id;
  return String(t._id);
}

export type ExecutorTaskSseSink = {
  next: (event: ExecutorSseEvent) => void;
};

/**
 * Validates executor headers, then multiplexes dispatch, heartbeat, and pairing-rotation events.
 * Callers wire this to their HTTP/SSE layer; dispose stops timers and unsubscribes listeners.
 */
export async function connectExecutorTaskSse(
  hub: ExecutorTaskSseHub,
  headers: Record<string, string | string[] | undefined>,
  options: ExecutorTaskSseOptions,
  sink: ExecutorTaskSseSink,
): Promise<() => void> {
  const { executorToken } = await hub.identityAuth.requireExecutor(headers);

  let closed = false;
  const disposeFns: Array<() => void> = [];

  const safeNext = (event: ExecutorSseEvent) => {
    if (!closed) sink.next(event);
  };

  /** Dedupe in-process emit vs Mongo poll on this connection only. */
  const sentUnclaimedIds = new Set<string>();

  const pushDispatchIfNew = (task: unknown) => {
    const t = task as { targetExecutorToken?: string };
    if (t.targetExecutorToken !== executorToken) return;
    const id = dispatchDocIdString(task);
    if (id) {
      if (sentUnclaimedIds.has(id)) return;
      sentUnclaimedIds.add(id);
    }
    safeNext({ type: 'dispatch', data: JSON.stringify(task) });
  };

  disposeFns.push(
    hub.dispatch.onTask((task: unknown) => {
      pushDispatchIfNew(task);
    }),
  );

  const pollMs = resolveUnclaimedPollIntervalMs(options);
  if (pollMs > 0) {
    let pollInFlight = false;
    const pollTick = () => {
      if (closed || pollInFlight) return;
      pollInFlight = true;
      void hub.dispatch
        .list({ executorToken, limit: 50 })
        .then((rows) => {
          for (const row of rows) {
            pushDispatchIfNew(row);
          }
        })
        .catch(() => {
          // Non-fatal — next tick retries
        })
        .finally(() => {
          pollInFlight = false;
        });
    };
    const pollTimer = setInterval(pollTick, pollMs);
    disposeFns.push(() => clearInterval(pollTimer));
    queueMicrotask(pollTick);
  }

  const timer = setInterval(() => {
    safeNext({
      type: 'heartbeat',
      data: JSON.stringify({ ts: new Date().toISOString() }),
    });
  }, options.heartbeatIntervalMs);
  disposeFns.push(() => clearInterval(timer));

  disposeFns.push(
    hub.identity.subscribePairingRotations(executorToken, (payload: PairingRotatedPayload) => {
      safeNext({
        type: 'pairing_rotated',
        data: JSON.stringify({
          code: payload.code,
          ...(payload.expiresAt != null
            ? {
                expiresAt:
                  payload.expiresAt instanceof Date
                    ? payload.expiresAt.toISOString()
                    : String(payload.expiresAt),
              }
            : {}),
        }),
      });
    }),
  );

  return () => {
    if (closed) return;
    closed = true;
    for (const fn of disposeFns) fn();
  };
}
