export type AgentRosterRow = {
  slot: number;
  label: string;
  state: string;
};

export function formatAgentRosterListMarkdown(rows: AgentRosterRow[]): string {
  if (rows.length === 0) {
    return '**Local agents** — none on file yet. Your **first** run will bootstrap the default **agent #1** slot (one-time). Run `/agent create` first if you want more than one slot before that.';
  }
  const lines = [
    '**Local agents** (use **agent `#N`** on commands when several exist; default is **agent `#1`**):',
  ];
  for (const r of rows) {
    lines.push(`• **agent #${r.slot}** — ${r.label} (${r.state})`);
  }
  return lines.join('\n');
}

export function formatAgentCreateAck(slot: number): string {
  return `✅ **Agent created** — you now have **agent #${slot}**.`;
}

export function formatAgentDeleteAck(slot: number): string {
  return `🗑️ **Agent removed** — **agent #${slot}** was deleted. Remaining slots were renumbered.`;
}
