import { IM_SUMMARY_MIN_LENGTH } from '@topichub/core';
import { createExecutor } from './executor-factory.js';
const DEFAULT_INPUT_BUDGET = 12_000;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TURNS = 2;

/** Bound how much prior output we feed into the summarizer (middle dropped if needed). */
export function clipForSummaryPrompt(fullText: string, maxChars: number): string {
  const t = fullText.trim();
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head - 80;
  return `${t.slice(0, head)}\n\n[… ${fullText.length - head - tail} characters omitted …]\n\n${t.slice(-tail)}`;
}

/**
 * When agent output is long, run a second local agent pass to produce a short plain-text summary for IM.
 * Opt out: `TOPICHUB_SUMMARIZE_IM=0`.
 * Tuning: `TOPICHUB_SUMMARIZE_THRESHOLD`, `TOPICHUB_SUMMARIZE_INPUT_MAX`, `TOPICHUB_SUMMARIZE_TIMEOUT_MS`.
 */
export async function maybeSummarizeForIm(
  fullText: string,
  executorType: string,
  executorArgs?: string[],
): Promise<string | null> {
  if (process.env.TOPICHUB_SUMMARIZE_IM === '0') return null;
  if (executorType === 'none') return null;

  const threshold = Math.max(
    500,
    parseInt(process.env.TOPICHUB_SUMMARIZE_THRESHOLD ?? String(IM_SUMMARY_MIN_LENGTH), 10) || IM_SUMMARY_MIN_LENGTH,
  );
  if (fullText.length < threshold) return null;

  const inputBudget =
    parseInt(process.env.TOPICHUB_SUMMARIZE_INPUT_MAX ?? String(DEFAULT_INPUT_BUDGET), 10) || DEFAULT_INPUT_BUDGET;
  const timeoutMs =
    parseInt(process.env.TOPICHUB_SUMMARIZE_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;

  const body = clipForSummaryPrompt(fullText, inputBudget);
  const prompt = [
    'Compress the following prior agent output for an instant-messenger notification (plain text).',
    'Rules:',
    '- At most about 900 characters.',
    '- Match the source language when obvious; otherwise concise English.',
    '- No markdown code fences. No preamble or labels — output ONLY the summary body.',
    '',
    '---',
    body,
  ].join('\n');

  try {
    const executor = createExecutor(executorType);
    const r = await executor.execute(prompt, null, {
      timeoutMs,
      maxTurns: DEFAULT_MAX_TURNS,
      extraArgs: executorArgs,
      headless: true,
    });
    if (r.exitCode !== 0) {
      console.warn(`[SUMMARY]  imSummary skipped (exit ${r.exitCode}): ${r.text.slice(0, 200)}`);
      return null;
    }
    const s = r.text.trim();
    if (!s) return null;
    const maxOut =
      parseInt(process.env.TOPICHUB_SUMMARIZE_MAX_OUT ?? '1200', 10) || 1200;
    return s.length > maxOut ? `${s.slice(0, maxOut)}…` : s;
  } catch (err) {
    console.warn(
      `[SUMMARY]  imSummary failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
