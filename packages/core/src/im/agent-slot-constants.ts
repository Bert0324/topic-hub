/** Max local agent slots per executor (roster file + CLI enforcement). */
export const MAX_LOCAL_AGENTS = 32;

/** Key on `enrichedPayload.event.payload` for optional IM agent selector (1-based). */
export const IM_PAYLOAD_AGENT_SLOT_KEY = 'agentSlot' as const;

/** Internal op for executor-local agent control dispatches (no LLM). */
export const IM_PAYLOAD_AGENT_OP_KEY = 'topichubAgentOp' as const;

export const IM_PAYLOAD_AGENT_DELETE_SLOT_KEY = 'topichubAgentDeleteSlot' as const;
