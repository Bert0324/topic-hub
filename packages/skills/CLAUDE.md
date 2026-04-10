# Topic Hub Skills Repo

See AGENTS.md for full skill development conventions, interface contracts,
manifest schemas, and testing patterns.

Skills are organized by category under `skills/topics/`, `skills/platforms/`,
and `skills/adapters/`. Each skill has:
- `package.json` — manifest with `topichub` config (`category`, type-specific key)
- `SKILL.md` — agent instructions (YAML frontmatter: `executor`, `maxTurns`, `allowedTools`)
- `src/index.ts` — entry point exporting the category interface

Publish with `topichub publish`. Test locally with `topichub serve`.
