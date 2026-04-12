import { IM_PAYLOAD_AGENT_OP_KEY, IM_PAYLOAD_AGENT_SLOT_KEY } from './agent-slot-constants.js';

/**
 * IM line sent when an executor **claims** a dispatch — must name the **agent slot** when known
 * (default `#1` when `agentSlot` is absent on the payload).
 */
export function formatImClaimRunningMessage(enrichedPayload: unknown): string {
  const ep = enrichedPayload as { event?: { payload?: unknown } } | undefined;
  const pRaw = ep?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const op = pl[IM_PAYLOAD_AGENT_OP_KEY];
  if (op === 'list' || op === 'create' || op === 'delete') {
    return 'Your executor is running this **/agent** request.';
  }
  const slot = pl[IM_PAYLOAD_AGENT_SLOT_KEY];
  const n =
    typeof slot === 'number' && Number.isFinite(slot) && slot >= 1 ? Math.floor(slot) : 1;
  return `**Agent #${n}** on your executor is running this task.`;
}

/**
 * IM line when the executor has accepted the dispatch but will not **claim** it yet because another
 * run for the same roster slot is still in progress locally (serialized per `agentSlot`).
 */
export function formatImClaimQueuedMessage(enrichedPayload: unknown): string {
  const ep = enrichedPayload as { event?: { payload?: unknown } } | undefined;
  const pRaw = ep?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const op = pl[IM_PAYLOAD_AGENT_OP_KEY];
  if (op === 'list' || op === 'create' || op === 'delete') {
    return 'Your executor has **queued** this **/agent** request — it will run when the slot is free.';
  }
  const slot = pl[IM_PAYLOAD_AGENT_SLOT_KEY];
  const n =
    typeof slot === 'number' && Number.isFinite(slot) && slot >= 1 ? Math.floor(slot) : 1;
  return (
    `**Agent #${n}** on your executor has **queued** this task — it will start when the current run on this slot finishes.`
  );
}
