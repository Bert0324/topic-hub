/**
 * Minimum agent `result.text` length before we consider `imSummary` for IM completion.
 * Must match the default summarization gate in the CLI (`maybeSummarizeForIm`).
 */
export const IM_SUMMARY_MIN_LENGTH = 50_000;

/**
 * Use `imSummary` only when the full agent text is long enough to have been summarized;
 * otherwise always show `text` (short replies never go through summary).
 */
export function pickImNotifyBody(text: string | undefined, imSummary: string | undefined): string | undefined {
  const t = text ?? '';
  const body = t.trim();
  const s = (imSummary ?? '').trim();
  if (t.length < IM_SUMMARY_MIN_LENGTH) return body || s || undefined;
  if (s) return s;
  return body || undefined;
}
