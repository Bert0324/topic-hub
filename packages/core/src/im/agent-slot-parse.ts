import { MAX_LOCAL_AGENTS } from './agent-slot-constants.js';

function inAgentSlotRange(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_LOCAL_AGENTS;
}

/**
 * Plain relay: optional leading `#N` then body (e.g. `#2 summarize this`).
 * Does not apply to lines starting with `/` (slash commands).
 */
export function stripLeadingAgentSlotFromPlainRelay(line: string): {
  agentSlot: number | null;
  text: string;
} {
  const t = line.trimStart();
  if (!t || t.startsWith('/')) {
    return { agentSlot: null, text: line };
  }
  const m = t.match(/^#(\d+)\s+(\S[\s\S]*)$/);
  if (!m) {
    return { agentSlot: null, text: line };
  }
  const n = parseInt(m[1], 10);
  if (!inAgentSlotRange(n)) {
    return { agentSlot: null, text: line };
  }
  return { agentSlot: n, text: m[2].trimStart() ? m[2] : '' };
}

/** Slash invocation: `/Verb #N tail` — second token `#N` is the agent slot. */
export function stripAgentSlotFromSlashInvocationLine(line: string): {
  agentSlot: number | null;
  imText: string;
} {
  const t = line.trimStart();
  const m = t.match(/^(\/\S+)\s+(#\d+)(?:\s+(.*))?$/s);
  if (!m) {
    return { agentSlot: null, imText: line };
  }
  const n = parseInt(m[2].slice(1), 10);
  if (!inAgentSlotRange(n)) {
    return { agentSlot: null, imText: line };
  }
  const tail = (m[3] ?? '').trim();
  const rebuilt = tail ? `${m[1]} ${tail}` : m[1];
  return { agentSlot: n, imText: rebuilt };
}
