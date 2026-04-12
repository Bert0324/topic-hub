/**
 * Detects agent text that asks the human to choose or answer (e.g. speckit clarify
 * "Question 1 of 5") so Topic Hub can create a QA row and accept `/answer …` in IM.
 *
 * Opt out for a whole process: `TOPICHUB_DISABLE_INTERACTIVE_QA=1`.
 */
export function agentOutputSeeksImAnswer(text: string): boolean {
  if (process.env.TOPICHUB_DISABLE_INTERACTIVE_QA?.trim() === '1') {
    return false;
  }
  const t = text.trim();
  if (!t) return false;

  if (/\bTOPICHUB_QA_PENDING\b/.test(t)) {
    return true;
  }

  // speckit.specify (and similar) numbered clarify prompts
  if (/\bQuestion\s+\d+\s+of\s+\d+\b/i.test(t)) {
    return true;
  }

  return false;
}
