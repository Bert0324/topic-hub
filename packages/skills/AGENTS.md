# Topic Hub Skill Development

This repository contains Topic Hub skills. Each skill is a self-contained
package that plugs into the Topic Hub dispatch loop.

Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.
Each skill lives in `skills/{category}/<skill-name>/`.

## Skill Categories

There are three skill categories, each identified by a key in `package.json`
under the `topichub` section:

- **type** (`topichub.category = "type"`, key: `topicType`)
  Defines a topic type with lifecycle hooks (`onTopicCreated`, `onTopicUpdated`,
  `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`,
  `onSignalAttached`, `onTagChanged`), field schema validation, status
  transitions, and interactive-card rendering.

- **platform** (`topichub.category = "platform"`, key: `platform`)
  IM platform integration — handles inbound webhooks (`handleWebhook`),
  parses slash commands into `CommandResult`, posts/updates rich cards
  (`postCard`, `updateCard`), manages groups (`createGroup`, `inviteToGroup`),
  and sends plain messages (`sendMessage`). Must implement `resolveTenantId`
  for multi-tenant routing.

- **adapter** (`topichub.category = "adapter"`, key: `sourceSystem`)
  External system connector — transforms inbound webhooks from services
  like GitHub, Jira, or PagerDuty into `TopicEventPayload` objects via
  `transformWebhook`. Optionally provides `runSetup` for credential
  configuration.

## Key Conventions

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

## Required Exports by Category

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

## Local Development

```bash
topichub serve                  # poll for dispatches, run agents locally
topichub serve --executor none  # dry-run mode (no agent execution)
```

The serve command hot-reloads SKILL.md from disk on every dispatch, so you
can iterate on prompts without restarting.
