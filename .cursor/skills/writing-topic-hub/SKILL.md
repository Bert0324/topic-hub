---
name: writing-topic-hub
description: >-
  Guide for writing Topic Hub skills — covers manifests, interfaces, SKILL.md
  authoring, publishing, and testing. Use when creating, modifying, or debugging
  Topic Hub skills, or when working in the skills/ directory.
---

# Writing Topic Hub Skills

Skills are organized by category: `skills/topics/`, `skills/adapters/`.
Each skill lives in `skills/{category}/<skill-name>/` and is a self-contained package
that plugs into the Topic Hub dispatch loop via one of three category interfaces.

There are two authoring modes: **code skills** (full TypeScript implementation) and
**md-only skills** (just a SKILL.md file with AI instructions, no code required).

## Skill Categories

| Category | `topichub.category` | Key | Purpose |
|----------|---------------------|-----|---------|
| **type** | `type` | `topicType` | Topic type with lifecycle hooks, field schema, status transitions, card rendering |
| **adapter** | `adapter` | `sourceSystem` | External system connector — transforms webhooks into topic events |

## Md-Only Skills (SKILL.md only, no code)

For AI-driven skills that don't need custom card rendering or validation,
create a directory with just a `SKILL.md` file:

```
skills/topics/my-ai-skill/
  SKILL.md
```

The SKILL.md frontmatter declares identity and category:

```yaml
---
name: my-ai-skill
description: Analyzes topics and provides AI-driven insights
topicType: my-ai-type
executor: cursor
maxTurns: 6
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---

# System prompt here

## onTopicCreated
Instructions for when a topic is created...
```

## Skill Manifest (`package.json`) — Code Skills

Declared under the `topichub` key. Must include `category` and the
category-specific identifier (`topicType` or `sourceSystem`).

## SKILL.md Frontmatter

YAML frontmatter controls agent execution:
- `executor`: `claude` | `cursor` | `codex` | `none`
- `maxTurns`: max agent loop iterations
- `allowedTools`: array of MCP tool names the agent may call

The Markdown body becomes the system prompt. Use `## on<EventName>`
headings for per-event instructions.

## Interface Contracts

### TypeSkill
Required: `manifest`, `renderCard`, `validateMetadata`.
Lifecycle hooks (optional): `onTopicCreated`, `onTopicUpdated`,
`onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`,
`onTopicReopened`, `onSignalAttached`, `onTagChanged`.

> **Note:** Platform integration is handled by the built-in OpenClaw bridge, not by skills.

### AdapterSkill
Required: `manifest`, `transformWebhook`.
Optional: `runSetup` for credential configuration.

## Publish Workflow

```bash
topichub publish
```

Scans category subdirectories (`skills/topics/`, `skills/adapters/`),
validates each skill's `package.json`, bundles SKILL.md
and source, POSTs batch to server. Server upserts registrations and enables for tenant.

## Testing

- Unit test hooks and `renderCard`/`validateMetadata` directly.
- Test `transformWebhook` with sample payloads.
- Integration: `topichub serve --executor none` to verify dispatch pipeline.

## File Layout

### Code skill (full implementation)

```
skills/{category}/<skill-name>/
  package.json      # manifest
  SKILL.md          # agent instructions
  src/index.ts      # category interface implementation
  tests/
```

### Md-only skill (no code)

```
skills/{category}/<skill-name>/
  SKILL.md          # frontmatter (name, description, topicType) + AI instructions
```
