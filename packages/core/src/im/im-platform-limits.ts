/**
 * Prefix used when posting task completion to IM (must stay in sync with TopicHub.dispatch.complete).
 * Total message length on the wire is prefix + body (+ optional ellipsis).
 */
export const IM_TASK_COMPLETED_PREFIX = 'Task completed: ';

/** Reserve a few chars so "…" and formatting never exceed hard platform caps. */
const BUDGET_TAIL_RESERVE = 24;

/**
 * Conservative **total** message length (UTF-16 code units) for one IM send, by bridge platform.
 * Discord is strict (~2000); Feishu/Lark allows much longer posts.
 */
export function getImPlatformTotalMessageMax(platform: string | undefined | null): number {
  const p = String(platform ?? '')
    .toLowerCase()
    .trim();
  if (!p) return 10_000;
  if (p.includes('discord')) return 2000;
  if (p.includes('feishu') || p.includes('lark')) return 30_000;
  if (p.includes('telegram')) return 4096;
  if (p.includes('slack')) return 12_000;
  if (p.includes('weixin')) return 2000;
  return 10_000;
}

/**
 * Max length of the **body** after {@link IM_TASK_COMPLETED_PREFIX} for a completion line,
 * so `prefix + body` (plus optional single "…") stays under the platform cap.
 */
export function getImTaskCompletionBodyBudgetChars(platform: string | undefined | null): number {
  const total = getImPlatformTotalMessageMax(platform);
  const raw = total - IM_TASK_COMPLETED_PREFIX.length - BUDGET_TAIL_RESERVE;
  return Math.max(256, raw);
}
