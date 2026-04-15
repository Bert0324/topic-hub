import { IM_ENRICHED_ROOT_AGENT_OP_KEY, IM_PAYLOAD_AGENT_OP_KEY } from './agent-slot-constants.js';

export type ImAgentControlOp = 'list' | 'create' | 'delete';

/**
 * Resolves the IM `/agent` control op after claim: prefers **document-level** `imAgentControlOp` on
 * the SSE dispatch and on the claim response, then falls back to parsing `enrichedPayload` copies.
 */
export function resolveImAgentControlOp(
  dispatch: { imAgentControlOp?: unknown; enrichedPayload?: unknown } | null | undefined,
  claimed: { imAgentControlOp?: unknown; enrichedPayload?: unknown } | null | undefined,
): ImAgentControlOp | undefined {
  for (const row of [dispatch, claimed]) {
    if (!row || typeof row !== 'object') continue;
    const v = (row as { imAgentControlOp?: unknown }).imAgentControlOp;
    if (v === 'list' || v === 'create' || v === 'delete') {
      return v;
    }
  }
  const fromDispatch = parseImAgentControlOpFromEnrichedPayload(dispatch?.enrichedPayload);
  if (fromDispatch) return fromDispatch;
  return parseImAgentControlOpFromEnrichedPayload(claimed?.enrichedPayload);
}

/**
 * Reads IM `/agent` control op from `enrichedPayload`: nested {@link IM_PAYLOAD_AGENT_OP_KEY} first
 * (legacy), then root {@link IM_ENRICHED_ROOT_AGENT_OP_KEY} (duplicate set in skill pipeline for Mongo stacks
 * that drop dynamic keys under `event.payload`).
 */
export function parseImAgentControlOpFromEnrichedPayload(
  enrichedPayload: unknown,
): ImAgentControlOp | undefined {
  const ep = enrichedPayload as
    | { [key: string]: unknown; event?: { payload?: unknown } }
    | undefined;

  const pRaw = ep?.event?.payload;
  const pl =
    pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
      ? (pRaw as Record<string, unknown>)
      : {};
  const nested = pl[IM_PAYLOAD_AGENT_OP_KEY];
  if (nested === 'list' || nested === 'create' || nested === 'delete') {
    return nested;
  }

  const root = ep?.[IM_ENRICHED_ROOT_AGENT_OP_KEY];
  if (root === 'list' || root === 'create' || root === 'delete') {
    return root;
  }
  return undefined;
}
