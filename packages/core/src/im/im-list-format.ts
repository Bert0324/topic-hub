/** Single-line cap for IM list rows (avoid huge payloads). */
const IM_SNIP = 100;
const IM_TOPIC_SNIP = 48;

export function truncateOneLineIm(s: string, max = IM_SNIP): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Human-readable one-line summary for a pending QA row (used in lists and acks). */
export function formatQaSlotSummary(qa: {
  questionContext?: { skillName?: string; topicTitle?: string };
  questionText?: string;
}): string {
  const ctx = qa?.questionContext;
  const skill = ctx?.skillName != null ? String(ctx.skillName).trim() : '';
  const topic = ctx?.topicTitle != null ? String(ctx.topicTitle).trim() : '';
  const q =
    typeof qa?.questionText === 'string' ? truncateOneLineIm(qa.questionText, 72) : '';
  const parts: string[] = [];
  if (skill) parts.push(`skill **${truncateOneLineIm(skill, 40)}**`);
  if (topic) parts.push(`topic "${truncateOneLineIm(topic, IM_TOPIC_SNIP)}"`);
  if (q) parts.push(`Q: ${q}`);
  return parts.join(', ') || 'agent question';
}

export function formatQaListMarkdown(allPending: unknown[]): string {
  const lines = [
    '**Open agent questions** (oldest = `#1`). If several are open, use `/answer #N <text>` with the number from this list:',
  ];
  (allPending as any[]).forEach((qa, i) => {
    lines.push(`• **#${i + 1}** — ${formatQaSlotSummary(qa)}`);
  });
  return lines.join('\n');
}

export type ClaimedDispatchListRow = {
  id: string;
  skillName: string;
  createdAt?: string | null;
};

export function formatClaimedQueueListMarkdown(rows: ClaimedDispatchListRow[]): string {
  const lines = [
    '**Running tasks** in this topic (oldest = `#1`). If several are running, use `/queue #N <message or slash>` with the number from this list:',
  ];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const when = r.createdAt ? `since ${r.createdAt}` : '';
    lines.push(
      `• **#${i + 1}** — skill **${truncateOneLineIm(r.skillName || 'unknown', 40)}**${when ? `, ${when}` : ''}`,
    );
  }
  return lines.join('\n');
}

export function formatQaAnsweredAck(slot: number, targetQa: unknown): string {
  return `Answer received for **#${slot}** (${formatQaSlotSummary(targetQa as any)}). Your agent will continue.`;
}

export function formatQueueAck(
  slot: number,
  row: ClaimedDispatchListRow | null,
): string {
  const detail = row
    ? `after **#${slot}** — skill **${truncateOneLineIm(row.skillName || 'unknown', 40)}**${
        row.createdAt ? ` (${row.createdAt})` : ''
      }`
    : `after **#${slot}** in this topic`;
  return (
    `✅ **Queued** — will run ${detail}. No extra reply until the follow-up **starts**; ` +
    `then you get the usual "Your local agent is running this task."`
  );
}

/** How to reply with `#N`, plus the same summary as lists/acks (not prefixed as a reminder). */
export function formatQaHowToReplyLine(answerRef: number, qa: unknown): string {
  return (
    `Reply with \`/answer #${answerRef} <your response>\` — ` +
    `**#${answerRef}** is: ${formatQaSlotSummary(qa as any)}`
  );
}

export function formatQaReminderMessage(answerRef: number, qa: unknown): string {
  return `Reminder: your agent is waiting for an answer. ${formatQaHowToReplyLine(answerRef, qa)}`;
}
