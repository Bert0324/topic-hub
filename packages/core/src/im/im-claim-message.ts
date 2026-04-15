import { IM_PAYLOAD_AGENT_SLOT_KEY } from './agent-slot-constants.js';
import { resolveImAgentControlOp } from './im-agent-control-dispatch.js';

function splitClaimFormatInput(input: unknown): { top?: unknown; ep: unknown } {
  if (input != null && typeof input === 'object' && 'enrichedPayload' in input) {
    const o = input as { enrichedPayload?: unknown; imAgentControlOp?: unknown };
    return { top: o.imAgentControlOp, ep: o.enrichedPayload };
  }
  return { ep: input };
}

/**
 * IM line sent when an executor **claims** a dispatch — must name the **agent slot** when known
 * (default `#1` when `agentSlot` is absent on the payload).
 *
 * `input` may be the enriched payload alone, or `{ enrichedPayload, imAgentControlOp }` when the
 * dispatch row carries a root-level control op.
 */
export function formatImClaimRunningMessage(input: unknown): string {
  const { top, ep } = splitClaimFormatInput(input);
  if (resolveImAgentControlOp({ imAgentControlOp: top, enrichedPayload: ep }, null)) {
    return 'Your executor is running this **/agent** request.';
  }
  const enrichedPayload = ep as { event?: { payload?: unknown } } | undefined;
  const pRaw = enrichedPayload?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const slot = pl[IM_PAYLOAD_AGENT_SLOT_KEY];
  const n =
    typeof slot === 'number' && Number.isFinite(slot) && slot >= 1 ? Math.floor(slot) : 1;
  return `**Agent #${n}** on your executor is running this task.`;
}

/**
 * IM line when the executor has accepted the dispatch but will not **claim** it yet because another
 * run for the same roster slot is still in progress locally (serialized per `agentSlot`).
 */
export function formatImClaimQueuedMessage(input: unknown): string {
  const { top, ep } = splitClaimFormatInput(input);
  if (resolveImAgentControlOp({ imAgentControlOp: top, enrichedPayload: ep }, null)) {
    return 'Your executor has **queued** this **/agent** request — it will run when the slot is free.';
  }
  const enrichedPayload = ep as { event?: { payload?: unknown } } | undefined;
  const pRaw = enrichedPayload?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const slot = pl[IM_PAYLOAD_AGENT_SLOT_KEY];
  const n =
    typeof slot === 'number' && Number.isFinite(slot) && slot >= 1 ? Math.floor(slot) : 1;
  return (
    `**Agent #${n}** on your executor has **queued** this task — it will start when the current run on this slot finishes.`
  );
}
