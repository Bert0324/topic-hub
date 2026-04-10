# Topic Hub Skill Development

This repository contains Topic Hub skills. Each skill is a self-contained
package that plugs into the Topic Hub dispatch loop.

Skills are organized by category: `skills/topics/`, `skills/adapters/`.
Each skill lives in `skills/{category}/<skill-name>/`.

IM platform integration is handled by the OpenClaw bridge (configured at
the server level), not by individual skills.

## Skill Categories

Two skill categories, each identified by a key in `package.json`
under the `topichub` section:

- **type** (`topichub.category = "type"`, key: `topicType`)
  Defines a topic type with lifecycle hooks (`onTopicCreated`, `onTopicUpdated`,
  `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`,
  `onSignalAttached`, `onTagChanged`), field schema validation, status
  transitions, and card rendering.

- **adapter** (`topichub.category = "adapter"`, key: `sourceSystem`)
  External system connector — transforms inbound webhooks from services
  like GitHub, Jira, or PagerDuty into `TopicEventPayload` objects via
  `transformWebhook`. Optionally provides `runSetup` for credential
  configuration.

## Authoring Modes

**Code skills** — full TypeScript implementation:
- `package.json` — manifest with `topichub` config and `main` entry point
- `SKILL.md` — agent instructions (YAML frontmatter: `executor`, `maxTurns`, `allowedTools`)
- `src/index.ts` — exports TypeSkill or AdapterSkill interface

**Md-only skills** (type category only) — just a `SKILL.md`:
- Frontmatter declares `name`, `description`, `topicType`, `executor`
- System auto-generates TypeSkill stub with AI-driven logic
- No TypeScript code required

## Key Conventions

- Skill name regex: `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`
- Manifest: `package.json` with `topichub.category` + category-specific key
- `## on<EventName>` headings in SKILL.md for per-event AI instructions
- Entry point: `main` field in package.json (typically `src/index.ts`)

## Required Exports

### Type skill (`src/index.ts`)

Must export: `manifest` (TypeSkillManifest), `renderCard`, `validateMetadata`.
Lifecycle hooks are optional — implement only the events you need.

### Adapter skill (`src/index.ts`)

Must export: `manifest` (AdapterSkillManifest), `transformWebhook`.
Optional: `runSetup` for credential/webhook-URL configuration.

## Publish & Test

```bash
topichub publish                      # publish all skills to server
topichub serve                        # local dev with hot-reload
topichub serve --executor none        # dry-run (no agent execution)
```

The serve command hot-reloads SKILL.md from disk on every dispatch.
