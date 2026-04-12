import type { DispatchEvent } from './event-consumer.js';

export function getQueueAfterDispatchId(dispatch: DispatchEvent): string | undefined {
  const ep = dispatch.enrichedPayload as { event?: { payload?: Record<string, unknown> } } | undefined;
  const id = ep?.event?.payload?.queueAfterDispatchId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/** When false, the anchor is still treated as "running" for queue purposes. */
export function anchorStatusAllowsQueuedWork(status: string): boolean {
  return status !== 'claimed';
}
