export class HelpHandler {
  async execute() {
    const commands = [
      { command: '/create <type>', description: 'Start a topic in this chat (one open topic per group until closed)' },
      { command: '/update --status <status>', description: 'Move lifecycle: open → in_progress → resolved → closed (valid transitions only)' },
      { command: '/assign --user <userId>', description: 'Assign the active topic (when your role allows)' },
      { command: '/reopen', description: 'Reopen a closed topic in this group when none is active' },
      { command: '/search --type <type> --status <status>', description: 'Search topics' },
      {
        command: '/timeline',
        description: 'Timeline of the active topic (Topic Hub replies in chat — not sent to local executor)',
      },
      {
        command: '/show',
        description: 'Details of the active topic (Topic Hub replies in chat — not sent to local executor)',
      },
      {
        command: '/history',
        description: 'Past topics in this group (Topic Hub replies in chat — not sent to local executor)',
      },
      { command: '/use <skill-name>', description: 'Invoke a skill by name' },
      {
        command: '/skills list [--page N] [--limit N] [--sort popular|recent|usage]',
        description: 'DM only: browse published Skill Center catalog (no `/register` required)',
      },
      {
        command: '/skills star <skill-name>',
        description: 'DM only: like or unlike a published skill (requires `/register` + active serve — same as CLI `skills star`)',
      },
      { command: '/register <code>', description: 'DM: bind this IM user to your local executor (code from serve)' },
      { command: '/unregister', description: 'DM: remove executor binding' },
      {
        command: '/agent list  ·  /agent create  ·  /agent delete #N  ·  /agent #M <line>',
        description:
          'Topic group + active topic: manage **local agent slots** (`#1` default). Use **`/agent #M <line>`** so the next plain line or **`/Skill …`** runs on roster slot **M**; optional `#N` on a line still targets a slot when Hub does not use `/agent #M`.',
      },
      { command: '/help', description: 'This help (includes topic lifecycle overview in IM)' },
    ];

    return {
      success: true,
      data: { commands },
      message:
        'Lifecycle: register in DM → /create in group → plain text or `/agent #M …` / `/SkillName` to work → /update --status to progress → closed frees the group for a new /create; /reopen when needed.',
    };
  }
}
