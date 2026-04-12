export class HelpHandler {
  async execute() {
    const commands = [
      { command: '/create <type>', description: 'Start a topic in this chat (one open topic per group until closed)' },
      { command: '/update --status <status>', description: 'Move lifecycle: open → in_progress → resolved → closed (valid transitions only)' },
      { command: '/assign --user <userId>', description: 'Assign the active topic (when your role allows)' },
      { command: '/reopen', description: 'Reopen a closed topic in this group when none is active' },
      { command: '/search --type <type> --status <status>', description: 'Search topics' },
      { command: '/timeline', description: 'Timeline of the active topic' },
      { command: '/show', description: 'Details of the active topic' },
      { command: '/history', description: 'Past topics in this group' },
      { command: '/use <skill-name>', description: 'Invoke a skill by name' },
      {
        command: '/skills list [--page N] [--limit N] [--sort popular|recent|usage]',
        description: 'Browse published Skill Center catalog (group or DM)',
      },
      { command: '/skills star <skill-name>', description: 'Like or unlike a published skill (same as CLI `skills star`)' },
      { command: '/register <code>', description: 'DM: bind this IM user to your local executor (code from serve)' },
      { command: '/unregister', description: 'DM: remove executor binding' },
      {
        command: '/answer  or  /answer #N <text>',
        description:
          '`/answer` lists open questions; with several open, use `#N` from that list (`#1` = oldest). Replies echo which `#N` you answered.',
      },
      {
        command: '/queue  or  /queue #N <message or slash>',
        description:
          '`/queue` lists running (claimed) tasks; with several running, use `#N` from that list, or omit `#N` when only one runs. Same routing as plain text or `/SkillName` / `/use`.',
      },
      { command: '/help', description: 'This help (includes topic lifecycle overview in IM)' },
    ];

    return {
      success: true,
      data: { commands },
      message:
        'Lifecycle: register in DM → /create in group → plain text & /answer to work → /update --status to progress → closed frees the group for a new /create; /reopen when needed.',
    };
  }
}
