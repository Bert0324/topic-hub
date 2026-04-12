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
};

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

  disposeFns.push(
    hub.dispatch.onTask((task: unknown) => {
      const t = task as { targetExecutorToken?: string };
      if (t.targetExecutorToken !== executorToken) return;
      safeNext({ type: 'dispatch', data: JSON.stringify(task) });
    }),
  );

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
          expiresAt:
            payload.expiresAt instanceof Date
              ? payload.expiresAt.toISOString()
              : String(payload.expiresAt),
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
