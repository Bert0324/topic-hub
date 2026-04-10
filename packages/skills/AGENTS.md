# Topic Hub Skill Development

This repository contains Topic Hub skills. Each skill is a self-contained
package that plugs into the Topic Hub dispatch loop.

Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.
Each skill lives in `skills/{category}/<skill-name>/`.

## Skill Types

Topic Hub supports two authoring modes:

- **Code skills** — a directory with `package.json` (with `main` entry),
  `src/index.ts`, and optional `SKILL.md`. Full programmatic control over
  lifecycle hooks, card rendering, and metadata validation.
- **Md-only skills** — a directory with **only a `SKILL.md`** file (and
  optionally a `package.json` without `main`). No code required. All logic
  is expressed as natural-language AI instructions in SKILL.md. The system
  generates a default TypeSkill stub automatically.

## Skill Categories

There are three skill categories, each identified by a key in `package.json`
under the `topichub` section (or in `SKILL.md` frontmatter for md-only skills):

- **type** (`category = "type"`, key: `topicType`)
  Defines a topic type with lifecycle hooks (`onTopicCreated`, `onTopicUpdated`,
  `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`,
  `onSignalAttached`, `onTagChanged`), field schema validation, status
  transitions, and interactive-card rendering.

- **platform** (`category = "platform"`, key: `platform`)
  IM platform integration — handles inbound webhooks (`handleWebhook`),
  parses slash commands into `CommandResult`, posts/updates rich cards
  (`postCard`, `updateCard`), manages groups (`createGroup`, `inviteToGroup`),
  and sends plain messages (`sendMessage`). Must implement `resolveTenantId`
  for multi-tenant routing.

- **adapter** (`category = "adapter"`, key: `sourceSystem`)
  External system connector — transforms inbound webhooks from services
  like GitHub, Jira, or PagerDuty into `TopicEventPayload` objects via
  `transformWebhook`. Optionally provides `runSetup` for credential
  configuration.

## Md-Only Skills (SKILL.md only)

The fastest way to create a skill. No TypeScript, no `package.json` required.
Just create a directory with a `SKILL.md` file:

```
skills/topics/github-trends/
  SKILL.md
```

The SKILL.md frontmatter declares the skill identity and category:

```yaml
---
name: github-trends
description: Tracks GitHub trending repositories and enriches topics
topicType: github-trend
executor: cursor
maxTurns: 8
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Skill name (lowercase, hyphens, 1-64 chars) |
| `description` | yes | What the skill does (max 1024 chars) |
| `category` | no | `type` / `platform` / `adapter` (default: `type`) |
| `topicType` | no | Topic type identifier (defaults to `name`) |
| `platform` | no | Platform identifier (for platform skills) |
| `sourceSystem` | no | Source system identifier (for adapter skills) |
| `executor` | no | Agent executor: `claude` / `cursor` / `codex` / `none` |
| `maxTurns` | no | Max agent loop iterations (default 5) |
| `allowedTools` | no | MCP tool names the agent may call |

The Markdown body becomes the AI system prompt. Use `## on<EventName>`
headings for per-event instructions.

### What the system generates

For md-only skills, the system automatically creates a default TypeSkill stub:
- `manifest.ai = true` — enables SkillAiRuntime
- `fieldSchema` accepts any metadata (no validation)
- `renderCard` auto-renders metadata fields as text
- `validateMetadata` always passes

All actual intelligence comes from the SKILL.md instructions executed by the
AI agent via SkillAiRuntime and the dispatch pipeline.

### Md-only vs code skills

| Aspect | Md-only | Code skill |
|--------|---------|------------|
| Files needed | `SKILL.md` only | `package.json` + `src/index.ts` + `SKILL.md` |
| Card rendering | Auto-generated from metadata | Custom `renderCard()` |
| Metadata validation | Accepts anything | Custom `validateMetadata()` with zod schema |
| Lifecycle hooks | AI-driven via SKILL.md | Programmatic TypeScript hooks |
| Best for | AI-driven analysis, enrichment, classification | Custom UI, strict validation, platform integrations |

## Key Conventions (Code Skills)

- Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.
- Each skill lives in `skills/{category}/<skill-name>/`.
- Manifest is `package.json` with a `topichub` config section containing
  `category` and the category-specific identifier (`topicType`, `platform`,
  or `sourceSystem`).
- Agent instructions go in `SKILL.md` with YAML frontmatter fields:
  - `executor`: `claude` | `cursor` | `codex` | `none`
  - `maxTurns`: maximum agent loop iterations (default 5)
  - `allowedTools`: array of MCP tool names the agent may call
- The Markdown body of SKILL.md becomes the system prompt for the agent.
  Use `## on<EventName>` headings for per-event instructions.
- Entry point is specified by `main` in package.json (typically `src/index.ts`).
- Skill name must match the regex `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`.

## Publish Workflow

```bash
topichub publish
```

The scanner looks in category subdirectories (`skills/topics/`,
`skills/platforms/`, `skills/adapters/`), reads each skill's `package.json`
manifest, validates it, bundles SKILL.md and source files, and POSTs a batch
payload to the server. The server upserts `SkillRegistration` records and
auto-enables for the tenant.

## Required Exports by Category (Code Skills)

### Type skill (`src/index.ts`)

Must export: `manifest` (TypeSkillManifest), `renderCard`, `validateMetadata`.
Lifecycle hooks are optional — implement only the events you need.

### Platform skill (`src/index.ts`)

Must export: `manifest` (PlatformSkillManifest).
Key optional methods: `handleWebhook`, `createGroup`, `postCard`,
`resolveTenantId`, `runSetup`.

### Adapter skill (`src/index.ts`)

Must export: `manifest` (AdapterSkillManifest), `transformWebhook`.
Optional: `runSetup` for credential/webhook-URL configuration.

## Testing

- Unit test lifecycle hooks and `renderCard`/`validateMetadata` directly.
- Unit test `transformWebhook` with sample payloads from the source system.
- Integration test with `topichub serve --executor none` to verify the
  dispatch → claim → agent → result pipeline.
- Md-only skills can be tested by triggering topic creation and inspecting
  AI-generated timeline entries.

## Local Development

```bash
topichub serve                  # poll for dispatches, run agents locally
topichub serve --executor none  # dry-run mode (no agent execution)
```

The serve command hot-reloads SKILL.md from disk on every dispatch, so you
can iterate on prompts without restarting.
