# Topic Hub Skill Development

This package holds Topic Hub skills under `topics/` and `adapters/`. Each skill is a
self-contained package that plugs into the Topic Hub dispatch loop.

## Skill Categories

- **type** (`topichub.category = "type"`, key: `topicType`) — topic lifecycle, validation, cards.
- **adapter** (`topichub.category = "adapter"`, key: `sourceSystem`) — inbound webhooks via `transformWebhook`.

Authoring modes: **code skills** (`package.json` + `SKILL.md` + `src/index.ts`) and **md-only type skills** (`SKILL.md` only).

See `.cursor/skills/writing-topic-hub/SKILL.md` for manifests, frontmatter, and publishing.

## Secure IM dispatch (OpenClaw)

IM traffic is **not** implemented as platform skills. The server **OpenClaw bridge** receives commands, resolves the sender, and routes work through **secure dispatch** to that user’s linked local CLI (`topichub-admin serve`).

### Identity binding

1. User sends **`/topichub register`** in IM → receives a short-lived pairing code.
2. User runs **`topichub-admin link <code>`** on the machine where they run the executor → IM identity (platform + platform user id) is bound to that CLI’s claim token.
3. Later IM commands for that user carry **`dispatchMeta`** (`targetUserId`, `sourceChannel`, `sourcePlatform`) so dispatches are **scoped to that user** and picked up only by their executor.

Cross-platform: register and link again from another IM product to attach multiple platforms to the same local executor.

### Q&A relay

Skills may need user input during a dispatch. The executor uses the Q&A API; the server posts the question to IM. The user replies with:

```text
/answer <text>
```

With multiple pending questions, use **`/answer #N <text>`** to target a specific one.

Skill authors should design agents to **call the question endpoint and wait for an answer** (see `QaService` / dispatch question API) instead of blocking on stdin.

### Platform skills

**Platform skills no longer exist.** All IM interaction goes through the OpenClaw bridge and secure dispatch; skills remain **type** or **adapter** only.

## Conventions

- Skill name regex: `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`
- `## on<EventName>` headings in `SKILL.md` for per-event AI instructions

```bash
topichub publish
topichub serve
topichub serve --executor none
```
