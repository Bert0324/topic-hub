/**
 * Minimum agent `result.text` length before we consider `imSummary` for IM completion
 * when no per-platform budget is supplied (legacy gate; must match CLI default threshold).
 */
export const IM_SUMMARY_MIN_LENGTH = 50_000;

/**
 * Choose plain `text` vs `imSummary` for the IM completion body (after the "Task completed: " prefix).
 *
 * When `imBodyBudgetChars` is set (platform limit), prefer `imSummary` if the full body does not fit
 * but the summary does.
 */
export function pickImNotifyBody(
  text: string | undefined,
  imSummary: string | undefined,
  imBodyBudgetChars?: number,
): string | undefined {
  const t = text ?? '';
  const body = t.trim();
  const s = (imSummary ?? '').trim();

  if (imBodyBudgetChars != null && imBodyBudgetChars > 0 && body.length > imBodyBudgetChars) {
    if (s.length > 0 && s.length <= imBodyBudgetChars) {
      return s;
    }
    if (s.length > imBodyBudgetChars) {
      return s.slice(0, imBodyBudgetChars);
    }
    return body || undefined;
  }

  if (t.length < IM_SUMMARY_MIN_LENGTH) return body || s || undefined;
  if (s) return s;
  return body || undefined;
}
