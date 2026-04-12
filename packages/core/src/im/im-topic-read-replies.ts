/** Format Hub-only `/show`, `/timeline`, `/history` replies for IM (no local executor). */

function fmtWhen(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '—';
}

function truncateOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** One-line summary for a timeline payload (best-effort). */
function timelinePayloadSummary(payload: Record<string, unknown> | undefined): string {
  if (!payload || typeof payload !== 'object') return '';
  const title = typeof payload.title === 'string' ? payload.title : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  const status = typeof payload.status === 'string' ? payload.status : '';
  const bits = [title, status, content].filter(Boolean);
  if (bits.length === 0) return '';
  return truncateOneLine(bits.join(' · '), 120);
}

export function formatImShowTopicReply(topic: {
  _id: { toString(): string };
  type?: string;
  title?: string;
  status?: string;
  sourceUrl?: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  assignees?: unknown[];
  tags?: unknown[];
}): string {
  const lines = [
    '## Active topic',
    '',
    `**Title:** ${truncateOneLine(String(topic.title ?? '(no title)'), 200)}`,
    `**Type:** \`${String(topic.type ?? '—')}\` · **Status:** \`${String(topic.status ?? '—')}\``,
    `**ID:** \`${topic._id.toString()}\``,
    `**Created:** ${fmtWhen(topic.createdAt)} · **Updated:** ${fmtWhen(topic.updatedAt)}`,
  ];
  if (topic.sourceUrl) {
    lines.push(`**Source:** ${truncateOneLine(String(topic.sourceUrl), 240)}`);
  }
  if (topic.createdBy) {
    lines.push(`**Created by:** \`${String(topic.createdBy)}\``);
  }
  const assignees = Array.isArray(topic.assignees) ? topic.assignees : [];
  if (assignees.length > 0) {
    lines.push(`**Assignees:** ${assignees.map((a) => `\`${String(a)}\``).join(', ')}`);
  }
  const tags = Array.isArray(topic.tags) ? topic.tags : [];
  if (tags.length > 0) {
    lines.push(`**Tags:** ${tags.map((t) => `\`${String(t)}\``).join(', ')}`);
  }
  lines.push('', '_Served from Topic Hub (no local executor)._');
  return lines.join('\n');
}

export function formatImTimelineReply(result: {
  entries: Array<{
    actionType?: string;
    actor?: string;
    timestamp?: unknown;
    payload?: Record<string, unknown>;
  }>;
  total: number;
  page: number;
  pageSize: number;
}): string {
  const { entries, total, page, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const header = [
    '## Topic timeline',
    '',
    `_Page **${page}** / **${totalPages}** — **${total}** entr${total === 1 ? 'y' : 'ies'}_`,
    '',
  ];
  if (!entries.length) {
    return [...header, '_No timeline entries for this topic yet._', '', '_Served from Topic Hub (no local executor)._'].join(
      '\n',
    );
  }
  const body: string[] = [];
  for (const e of entries) {
    const when = fmtWhen(e.timestamp);
    const act = String(e.actionType ?? 'event');
    const actor = String(e.actor ?? '—');
    const extra = timelinePayloadSummary(e.payload);
    body.push(
      extra
        ? `• **${act}** · \`${actor}\` · ${when}\n  ${extra}`
        : `• **${act}** · \`${actor}\` · ${when}`,
    );
  }
  header.push(...body);
  header.push('', '_Served from Topic Hub (no local executor)._');
  return header.join('\n');
}

export function formatImHistoryReply(
  topics: Array<{
    _id: { toString(): string };
    type?: string;
    title?: string;
    status?: string;
    createdAt?: unknown;
  }>,
): string {
  const lines = ['## Topics in this group', ''];
  if (!topics.length) {
    lines.push('_No topics found for this group._');
    lines.push('', '_Served from Topic Hub (no local executor)._');
    return lines.join('\n');
  }
  topics.forEach((t, i) => {
    const title = truncateOneLine(String(t.title ?? '(no title)'), 120);
    lines.push(
      `${i + 1}. **${title}** · \`${String(t.status ?? '—')}\` · type \`${String(t.type ?? '—')}\` · \`${t._id.toString()}\` · ${fmtWhen(t.createdAt)}`,
    );
  });
  lines.push('', '_Newest first · served from Topic Hub (no local executor)._');
  return lines.join('\n');
}
