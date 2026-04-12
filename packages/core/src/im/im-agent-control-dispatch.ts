import { IM_PAYLOAD_AGENT_OP_KEY } from './agent-slot-constants.js';

export type ImAgentControlOp = 'list' | 'create' | 'delete';

/**
 * Reads {@link IM_PAYLOAD_AGENT_OP_KEY} from a dispatch `enrichedPayload` (pre-claim SSE/catch-up or post-claim merge).
 */
export function parseImAgentControlOpFromEnrichedPayload(
  enrichedPayload: unknown,
): ImAgentControlOp | undefined {
  const ep = enrichedPayload as { event?: { payload?: unknown } } | undefined;
  const pRaw = ep?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const op = pl[IM_PAYLOAD_AGENT_OP_KEY];
  if (op === 'list' || op === 'create' || op === 'delete') {
    return op;
  }
  return undefined;
}
