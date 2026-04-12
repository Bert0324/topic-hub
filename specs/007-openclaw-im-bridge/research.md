# Research: OpenClaw IM Bridge

**Date**: 2026-04-10 | **Feature**: 007-openclaw-im-bridge

## R1: OpenClaw Integration Mode (No-AI Message Relay)

**Decision**: Use OpenClaw's outbound webhook (`message.received` event) for inbound messages, and OpenClaw's message send API for outbound messages. Bypass OpenClaw's AI agent pipeline entirely.

**Rationale**: The spec requires the bridge to be a pure message relay with no AI/LLM processing. OpenClaw supports this through:
- **Inbound**: Configure an outbound webhook on the `message.received` event — OpenClaw forwards raw user messages to Topic Hub's webhook endpoint before any agent processing occurs.
- **Outbound**: Use the message send action (`action: "send"`) to push messages to a specific channel and target, without invoking an agent.

**Alternatives considered**:
- Using OpenClaw's `/api/v1/chat` endpoint — rejected because it routes through the AI agent pipeline, violating the no-AI constraint.
- Using OpenClaw's `/hooks/agent` endpoint — rejected, same reason (runs an isolated agent turn).
- Direct IM platform SDK integration (no OpenClaw) — rejected per spec; OpenClaw provides multi-platform abstraction.

## R2: Inbound Webhook Payload Format

**Decision**: Accept OpenClaw's `message.received` outbound webhook format with the following known fields:

```json
{
  "event": "message.received",
  "timestamp": "2026-03-15T10:30:00Z",
  "data": {
    "channel": "lark-main",
    "user": "user123",
    "message": "/topichub create bug --title \"Login broken\"",
    "sessionId": "session-456"
  },
  "signature": "sha256=abc123..."
}
```

**Rationale**: This is OpenClaw's documented outbound webhook format. The `data.channel` field identifies the IM platform + account, `data.user` identifies the sender, and `data.message` contains the raw message text. The `signature` field enables HMAC-SHA256 verification.

**Key mapping to Topic Hub concepts**:
- `data.channel` → used for tenant resolution (via config mapping) and as `groupId` for topic association
- `data.user` → `userId` in CommandContext
- `data.message` → raw command string for CommandParser
- `data.sessionId` → used for deduplication (FR-010)

**Alternatives considered**:
- Custom webhook format — rejected; using OpenClaw's native format avoids a translation layer in OpenClaw config.

## R3: Outbound Message Send Format

**Decision**: Use OpenClaw's message send action with the following JSON body:

```json
{
  "action": "send",
  "channel": "lark",
  "target": "<channel_id_or_group_id>",
  "message": "## Bug Created\n\n**Title**: Login broken\n**Type**: bug\n**Status**: open\n..."
}
```

**Rationale**: The `action: "send"` path bypasses agent processing. The `channel` field specifies the platform plugin type (e.g., `lark`, `telegram`, `slack`), and `target` specifies the recipient (group/user ID). The `message` field accepts plain text; markdown rendering depends on the platform's capabilities.

**Alternatives considered**:
- Using `channelData` for platform-specific rich formatting (e.g., Lark interactive cards) — rejected per spec (no card support; markdown only).
- Using `/api/v1/chat` — rejected (triggers AI agent).

## R4: Tenant Resolution Strategy

**Decision**: Use a static configuration mapping from OpenClaw `channel` identifier to Topic Hub `tenantId`. Stored in `TopicHubConfig.openclaw.tenantMapping`.

```json
{
  "openclaw": {
    "gatewayUrl": "http://localhost:18789",
    "token": "Bearer xxx",
    "webhookSecret": "hmac-secret",
    "tenantMapping": {
      "lark-main": { "tenantId": "tenant_abc", "platform": "lark" },
      "slack-eng": { "tenantId": "tenant_abc", "platform": "slack" },
      "telegram-ops": { "tenantId": "tenant_def", "platform": "telegram" }
    }
  }
}
```

**Rationale**: Simple, deterministic, no database lookup required. The mapping is small (single-digit tenants, handful of channels) and changes infrequently. The `platform` field is preserved for display/logging and for resolving the correct outbound channel when sending notifications.

**Alternatives considered**:
- Database-backed mapping (MongoDB collection) — rejected as over-engineering for the expected scale.
- Deriving tenant from OpenClaw agent configuration — rejected; too tightly coupled to OpenClaw internals.

## R5: Deduplication Strategy (FR-010)

**Decision**: Use OpenClaw's `data.sessionId` + message content hash as a deduplication key with a short-lived in-memory cache (TTL: 60 seconds).

**Rationale**: OpenClaw may retry webhook delivery on timeout. The `sessionId` uniquely identifies the conversation context, and combined with a content hash prevents duplicate command execution. A 60-second TTL is sufficient to cover retry windows without growing memory unboundedly.

**Alternatives considered**:
- MongoDB-backed dedup — rejected as over-engineering; the retry window is short.
- Relying solely on `sessionId` — rejected; same session may have legitimately repeated commands.

## R6: Rich Text Rendering Format

**Decision**: Render topic data as markdown text with a consistent template:

```markdown
## [topic_type] Title Here

**Status**: open → in_progress
**Assignees**: @user1, @user2
**Priority**: high

---
**Key Fields**:
- **label1**: value1
- **label2**: value2

[View topic](https://topichub.example.com/topics/abc123)
```

**Rationale**: Markdown is universally supported across IM platforms via OpenClaw. It provides sufficient formatting (headers, bold, lists, links) for topic notifications without requiring platform-specific card structures.

**Alternatives considered**:
- Plain text — rejected; too hard to scan for key information.
- HTML — rejected; not universally supported across IM platforms.
- Platform-specific formatting (Lark card, Slack blocks) — rejected per spec.

## R7: PlatformSkill Removal Scope

**Decision**: Complete removal of all PlatformSkill-related code, types, and documentation across the monorepo.

**Files to delete**:
- `packages/core/src/skill/interfaces/platform-skill.ts`
- `packages/skills/platforms/lark-bot/` (entire directory)
- `packages/cli/src/scaffold/templates/platform-skill.ts`

**Files to modify**:
- `packages/core/src/index.ts` — remove PlatformSkill exports
- `packages/core/src/skill/interfaces/index.ts` — remove re-export
- `packages/core/src/skill/registry/skill-registry.ts` — remove from AnySkill union, remove getPlatformSkills()
- `packages/core/src/skill/pipeline/skill-pipeline.ts` — remove runPlatformSkills(), add OpenClaw notification
- `packages/core/src/webhook/webhook-handler.ts` — remove handlePlatformWebhook, replace with OpenClaw inbound
- `packages/core/src/topichub.ts` — remove messaging facade's postCard, update send to use bridge
- `packages/cli/src/scaffold/skill-scaffold.ts` — remove platform skill generation
- `packages/cli/src/scaffold/repo-scaffold.ts` — update documentation

**Documentation to update**:
- `packages/skills/AGENTS.md`, `packages/skills/CLAUDE.md`
- `.cursor/skills/writing-topic-hub/SKILL.md`
- `.cursor/rules/writing-topic-hub.mdc`

**Rationale**: Clean break — no deprecated code paths, no feature flags. The bridge fully replaces PlatformSkill functionality.

## R8: CardData Disposition

**Decision**: Keep `CardData`, `CardField`, `CardAction`, and `CardTemplate` types in `type-skill.ts` — they are owned by TypeSkill (`renderCard`) and used by the AI pipeline. The bridge's `MessageRenderer` will consume `CardData` from TypeSkill and convert it to markdown, replacing the platform-specific card rendering that `lark-bot` previously did.

**Rationale**: `CardData` is a TypeSkill concern (how topic data is structured for display), not a PlatformSkill concern. Removing it would break the TypeSkill interface. The bridge simply renders it differently (markdown instead of Lark interactive cards).

**Alternatives considered**:
- Remove CardData entirely — rejected; breaks TypeSkill.renderCard contract.
- Rename to avoid "card" terminology — rejected; unnecessary churn; the type represents structured display data regardless of output format.
