import { IM_PAYLOAD_AGENT_SLOT_KEY, MAX_LOCAL_AGENTS } from './agent-slot-constants.js';

/**
 * Optional IM prefix: `/agent #N <rest>` — targets roster **slot N** for the inner line (relay, `/Skill …`,
 * or plain text). Does not match `/agent list|create|delete` (no `#N` token).
 */
export function stripOptionalImAgentTargetPrefix(raw: string): {
  line: string;
  imTargetAgentSlot?: number;
} {
  const t = raw.trim();
  const m = t.match(/^\/agent\s+#(\d+)\s+([\s\S]+)$/i);
  if (!m) {
    return { line: raw };
  }
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_LOCAL_AGENTS) {
    return { line: raw };
  }
  let inner = m[2].trimStart();
  // Allow `/agent #2 queue …` / `… answer …` (IM users often omit the inner `/`).
  if (/^queue\b/i.test(inner) && !inner.startsWith('/')) {
    inner = `/${inner}`;
  } else if (/^answer\b/i.test(inner) && !inner.startsWith('/')) {
    inner = `/${inner}`;
  }
  return { line: inner, imTargetAgentSlot: n };
}

/** Agent slot stored on the dispatch payload (default **#1** when absent). */
export function readAgentSlotFromDispatchDoc(doc: unknown): number {
  const ep = (doc as { enrichedPayload?: { event?: { payload?: unknown } } })?.enrichedPayload;
  const pRaw = ep?.event?.payload;
  if (pRaw == null || typeof pRaw !== 'object' || Array.isArray(pRaw)) {
    return 1;
  }
  const raw = (pRaw as Record<string, unknown>)[IM_PAYLOAD_AGENT_SLOT_KEY];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return 1;
}
