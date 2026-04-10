# Data Model: OpenClaw IM Bridge

**Date**: 2026-04-10 | **Feature**: 007-openclaw-im-bridge

## Entity Changes

This feature primarily **removes** entities (PlatformSkill types) and **adds** configuration entities. No new MongoDB collections are introduced.

### New: OpenClaw Configuration (in-memory / config file)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gatewayUrl` | `string (URL)` | yes | OpenClaw gateway base URL (e.g., `http://localhost:18789`) |
| `token` | `string` | yes | Bearer token for authenticating outbound requests to OpenClaw |
| `webhookSecret` | `string` | yes | HMAC-SHA256 secret for verifying inbound webhook signatures |
| `tenantMapping` | `Record<string, TenantChannelEntry>` | yes | Maps OpenClaw channel IDs to tenant + platform |

**Validation**:
- `gatewayUrl` must be a valid URL
- `token` must be non-empty
- `webhookSecret` must be non-empty
- `tenantMapping` must have at least one entry

### New: TenantChannelEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Topic Hub tenant identifier |
| `platform` | `string` | yes | Platform name for display/logging (e.g., `lark`, `slack`) |

### Preserved: CardData (unchanged, from type-skill.ts)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | yes | Topic title |
| `fields` | `CardField[]` | yes | Structured key-value pairs |
| `actions` | `CardAction[]` | no | Action buttons (rendered as links in markdown) |
| `status` | `string` | yes | Current topic status |

CardData continues to be produced by `TypeSkill.renderCard()`. The bridge's `MessageRenderer` consumes it and outputs markdown instead of platform-specific cards.

### Removed: PlatformSkill Types

The following types are deleted entirely:

| Type | Was defined in | Replacement |
|------|---------------|-------------|
| `PlatformSkill` | `platform-skill.ts` | `OpenClawBridge` class |
| `PlatformSkillManifest` | `platform-skill.ts` | `OpenClawConfig` (zod schema) |
| `PlatformCapability` | `platform-skill.ts` | N/A — capabilities are OpenClaw's concern |
| `CommandResult` | `platform-skill.ts` | Inlined in `OpenClawBridge.parseInboundWebhook()` |
| `CreateGroupParams` | `platform-skill.ts` | N/A — group management out of scope |
| `GroupResult` | `platform-skill.ts` | N/A |
| `PostCardParams` | `platform-skill.ts` | `MessageRenderer.render()` input |

### Modified: SkillCategory Enum

```
Before: TYPE | PLATFORM | ADAPTER
After:  TYPE | ADAPTER
```

The `PLATFORM` category is removed from the enum. SkillRegistry no longer registers or resolves platform skills.

### Modified: TopicHubConfig (config.ts)

New optional field added:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `openclaw` | `OpenClawConfig` | no | OpenClaw bridge configuration. If absent, IM messaging is disabled. |

## Relationships

```
TopicHubConfig
  └── openclaw: OpenClawConfig
        └── tenantMapping: Record<channelId, TenantChannelEntry>
              └── tenantId → references Tenant entity (existing)

TypeSkill.renderCard(topic) → CardData → MessageRenderer.render(CardData) → markdown string
                                                                          → OpenClawBridge.send(channel, target, markdown)
```

## Deduplication State (in-memory)

| Field | Type | TTL | Description |
|-------|------|-----|-------------|
| key | `string` | 60s | `${sessionId}:${sha256(message).substring(0, 16)}` |
| value | `boolean` | 60s | Presence indicates already-processed |

Implemented as a `Map<string, number>` with periodic cleanup. No persistence needed — dedup is best-effort across a short retry window.
