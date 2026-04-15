# Contract: Outbound Send (Topic Hub → OpenClaw)

**Date**: 2026-04-10 | **Feature**: 007-openclaw-im-bridge

## Endpoint (OpenClaw API)

```
POST {gatewayUrl}/api/v1/send
Authorization: Bearer {token}
Content-Type: application/json
```

## Request Payload

```json
{
  "action": "send",
  "channel": "lark",
  "target": "group_chat_id_or_user_id",
  "message": "## Bug Created\n\n**Title**: Login broken\n**Type**: bug\n**Status**: open\n**Assignees**: @user1\n\n---\n- **priority**: high\n- **source**: IM command\n\n[View topic](https://topichub.example.com/topics/abc123)"
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `string` | yes | Always `"send"` — bypasses AI agent processing |
| `channel` | `string` | yes | Platform plugin type in OpenClaw (e.g., `lark`, `telegram`, `slack`) |
| `target` | `string` | yes | Recipient identifier — group chat ID, user ID, or conversation ID |
| `message` | `string` | yes | Markdown-formatted message content |

## Usage Scenarios

### 1. Command Reply

After processing an inbound command, send the result back to the originating channel/user.

**Trigger**: Command execution completes (success or error).
**Target**: `data.channel` (resolved to platform) + conversation from inbound webhook.
**Content**: Command result rendered as markdown.

### 2. Lifecycle Notification

When a topic lifecycle event occurs (created, updated, status changed, assigned, closed, reopened), send a notification to all channels configured for the topic's tenant.

**Trigger**: `SkillPipeline.execute()` → bridge notification step (replaces `runPlatformSkills`).
**Target**: All channels in `tenantMapping` where `tenantId` matches the event's tenant.
**Content**: Topic data rendered as markdown via `MessageRenderer`.

### 3. Direct Message (API-triggered)

When the `TopicHub.messaging.send()` facade is called programmatically (e.g., from a command handler or external API).

**Trigger**: `TopicHub.messaging.send(channel, { tenantId, groupId, message })`.
**Target**: Resolved from the channel parameter.
**Content**: Provided message string.

## Rich Text Message Template

The `MessageRenderer` produces markdown from `CardData`:

```markdown
## [{topic_type}] {title}

**Status**: {status}
**Assignees**: {assignees_list}

---
{fields_as_bullet_list}

{actions_as_links}
```

### Field Rendering Rules

| CardData field | Markdown output |
|---------------|-----------------|
| `title` | H2 header with topic type prefix |
| `status` | Bold label |
| `fields[].label + value` | Bullet list items: `- **{label}**: {value}` |
| `fields[].type = 'link'` | Value rendered as `[{value}]({value})` |
| `fields[].type = 'user'` | Value prefixed with `@` |
| `actions[].label + command` | Rendered as markdown links: `[{label}]({command})` if URL, else plain text |

## Error Handling

- **Network failure**: Log error, do not retry, do not block pipeline. Return gracefully.
- **HTTP 4xx**: Log error with response body. Likely config issue (bad token, invalid channel).
- **HTTP 5xx**: Log error. OpenClaw gateway issue — transient.
- **Rate limit (HTTP 429)**: Log warning. Consider backoff for subsequent sends within the same pipeline run.

## Authentication

All outbound requests include the Bearer token from `config.openclaw.token` in the `Authorization` header. Token is managed by the administrator via `topichub init` or environment variables.
