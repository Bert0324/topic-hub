/**
 * Strip IM-specific noise from freeform relay text before it is stored in dispatch payloads
 * or shown to the local agent as "what the user said".
 *
 * - Feishu/Lark `<at user_id="…">…</at>` rich mentions
 * - Leading Discord / Slack `<@…>` mentions
 * - Collapses whitespace
 */
export function purifyImRelayText(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  s = s.replace(/<at\b[^>]*\/>/gi, ' ').trim();
  s = s.replace(/<at\b[^>]*>[\s\S]*?<\/at>/gi, ' ').trim();

  for (;;) {
    const m = s.match(/^(<@[!&]?[\w]+>)\s*/);
    if (!m) break;
    s = s.slice(m[0].length).trim();
  }

  // Single-token leading handle (`@MyBot hi` → `hi`). Multi-word display names are usually `<at>…</at>` above.
  s = s.replace(/^@\S+\s+/, '').trim();

  return s.replace(/\s+/g, ' ').trim();
}
