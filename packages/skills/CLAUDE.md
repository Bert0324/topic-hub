# Topic Hub Skills Repo

See AGENTS.md for full skill development conventions, interface contracts,
manifest schemas, and testing patterns.

Skills are organized by category under `skills/topics/`, `skills/platforms/`,
and `skills/adapters/`.

## Two authoring modes

**Code skills** (full control):
- `package.json` — manifest with `topichub` config and `main` entry point
- `SKILL.md` — agent instructions (YAML frontmatter: `executor`, `maxTurns`, `allowedTools`)
- `src/index.ts` — entry point exporting the category interface

**Md-only skills** (no code):
- `SKILL.md` only — frontmatter declares `name`, `description`, `topicType`, etc.
- No `package.json` or code needed. The system auto-generates a TypeSkill stub.
- All logic is AI-driven via natural-language instructions in the Markdown body.

Publish with `topichub publish`. Test locally with `topichub serve`.
