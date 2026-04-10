---
name: writing-topic-hub
description: >-
  Guide for writing Topic Hub skills — covers manifests, interfaces, SKILL.md
  authoring, publishing, and testing. Use when creating, modifying, or debugging
  Topic Hub skills, or when working in the skills/ directory.
---

# Writing Topic Hub Skills

## Overview

Skills are self-contained packages that plug into the Topic Hub dispatch loop.
Two categories: **type** (topic lifecycle) and **adapter** (external system connector).
Two authoring modes: **code skills** (TypeScript) and **md-only skills** (just a SKILL.md).

IM platform integration is handled by the built-in OpenClaw bridge at the server level — not by skills.

## Quick Reference

| Category | `topichub.category` | Key | Purpose | Md-only? |
|----------|---------------------|-----|---------|----------|
| **type** | `type` | `topicType` | Topic lifecycle hooks, field schema, card rendering | Yes |
| **adapter** | `adapter` | `sourceSystem` | Transform external webhooks into topic events | No (requires code) |

### Required Exports

| Category | Required | Optional |
|----------|----------|----------|
| **TypeSkill** | `manifest`, `renderCard`, `validateMetadata` | `onTopicCreated`, `onTopicUpdated`, `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`, `onSignalAttached`, `onTagChanged` |
| **AdapterSkill** | `manifest`, `transformWebhook` | `runSetup` |

## File Layout

### Code skill

```
skills/{topics,adapters}/<skill-name>/
  package.json      # manifest with topichub config
  SKILL.md          # agent instructions (frontmatter + system prompt)
  src/index.ts      # implements TypeSkill or AdapterSkill
  tests/
```

### Md-only skill (type category only)

```
skills/topics/<skill-name>/
  SKILL.md          # frontmatter declares name, topicType, executor, etc.
```

The system auto-generates a TypeSkill stub with `ai: true`, generic card rendering,
and permissive metadata validation. All logic is AI-driven via the SKILL.md prompt.

## Manifest (`package.json`)

### Type skill

```json
{
  "name": "my-bug-tracker",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "type",
    "topicType": "bug"
  },
  "dependencies": {
    "@topichub/core": "workspace:*"
  }
}
```

### Adapter skill

```json
{
  "name": "github-adapter",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "adapter",
    "sourceSystem": "github",
    "webhookPath": "/webhooks/github"
  },
  "dependencies": {
    "@topichub/core": "workspace:*"
  }
}
```

Skill name regex: `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`

## SKILL.md Frontmatter

```yaml
---
name: my-skill
description: What this skill does
topicType: my-type          # for type skills
executor: cursor            # claude | cursor | codex | none
maxTurns: 6
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---
```

The markdown body becomes the AI system prompt.
Use `## on<EventName>` headings for per-event instructions.

## Md-Only Skill Example

```yaml
---
name: github-trends
description: Tracks GitHub trending repos and enriches topics
topicType: github-trend
executor: cursor
maxTurns: 8
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---

# GitHub Trends Tracker

## onTopicCreated
1. Read the repo URL from topic metadata.
2. Fetch repository stats.
3. Classify by domain and add tags.
4. Post analysis summary to timeline.
```

## Publish & Test

```bash
topichub publish                      # publish all skills to server
topichub serve                        # local dev with hot-reload
topichub serve --executor none        # dry-run (no agent execution)
```

Scans `skills/topics/` and `skills/adapters/`, validates manifests, bundles
SKILL.md + source, POSTs batch to server.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Md-only skill with `category: adapter` | Adapters require code — use a code skill with `transformWebhook` |
| Missing `topicType` in type skill manifest | Add `topicType` under `topichub` in package.json |
| SKILL.md frontmatter missing `name` | Add `name` field matching the directory name |
| Using `platform` category | Platform skills no longer exist — IM is handled by the OpenClaw bridge |

## Secure dispatch, identity, and Q&A

**Identity binding** (MongoDB collections such as `user_identity_bindings`, `pairing_codes`): links an IM user (platform + platform user id) to a **topichub user id** and the local CLI’s claim token. Dispatches created from IM include `targetUserId` (and source channel/platform) so only that user’s **`topichub-admin serve`** instance can claim them. Skills do not implement this layer; they receive enriched topic/dispatch payloads as today.

**Q&A exchanges** (`qa_exchanges`): a running dispatch can post a question via the server (`QaService` / `POST .../dispatches/:id/question`). The user answers in IM with **`/answer <text>`** (or **`/answer #N <text>`** when several questions are pending). Code skills that drive agents should use the Q&A relay when they need user input instead of assuming a local TTY.

**Single active executor**: at most one `topichub-admin serve` registration per bound user is treated as active; a second instance gets a conflict unless **`--force`** is used (after stale heartbeats or crash recovery). **`--max-agents N`** caps concurrent agent subprocesses on that executor, not multiple separate serve processes.
