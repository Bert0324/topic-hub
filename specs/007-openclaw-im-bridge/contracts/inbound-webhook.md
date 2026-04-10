# Contract: Inbound Webhook (OpenClaw → Topic Hub)

**Date**: 2026-04-10 | **Feature**: 007-openclaw-im-bridge

## Endpoint

```
POST /webhooks/openclaw
Content-Type: application/json
```

No authentication — signature verification via HMAC-SHA256 in the payload.

## Request Payload

```json
{
  "event": "message.received",
  "timestamp": "2026-04-10T10:30:00Z",
  "data": {
    "channel": "lark-main",
    "user": "user_12345",
    "message": "/topichub create bug --title \"Login broken\" --priority high",
    "sessionId": "session-abc-456"
  },
  "signature": "sha256=a1b2c3d4e5f6..."
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | `string` | yes | Event type — only `message.received` is processed; others are ignored |
| `timestamp` | `string (ISO 8601)` | yes | When the message was received by OpenClaw |
| `data.channel` | `string` | yes | OpenClaw channel identifier — used for tenant resolution |
| `data.user` | `string` | yes | User identifier from the IM platform |
| `data.message` | `string` | yes | Raw message text from the user |
| `data.sessionId` | `string` | yes | Session/conversation identifier — used for deduplication |
| `signature` | `string` | yes | HMAC-SHA256 signature for payload verification |

## Processing Rules

1. **Signature verification**: Compute HMAC-SHA256 of the JSON body using the configured `webhookSecret`. Compare with `signature` field. Reject on mismatch (HTTP 401).

2. **Event filtering**: Only process `event: "message.received"`. Return HTTP 200 with `{ "status": "ignored" }` for other event types.

3. **Command detection**: Check if `data.message` starts with `/topichub` (or the configured command prefix). If not, return HTTP 200 with `{ "status": "ignored", "reason": "not a command" }`.

4. **Deduplication**: Check `${data.sessionId}:${hash(data.message)}` against the dedup cache. If present, return HTTP 200 with `{ "status": "duplicate" }`.

5. **Tenant resolution**: Look up `data.channel` in `config.openclaw.tenantMapping`. If not found, return HTTP 400 with `{ "error": "Unknown channel" }`.

6. **Command execution**: Parse the message through `CommandParser`, route via `CommandRouter`, execute via the command handler.

7. **Reply**: Send the command result as a rich text message back to `data.channel` + `data.user` (or conversation) via OpenClaw's send API.

## Response

### Success (command executed)

```json
HTTP 200
{
  "status": "ok",
  "result": { ... }
}
```

### Ignored (not a command / duplicate / unsupported event)

```json
HTTP 200
{
  "status": "ignored",
  "reason": "not a command"
}
```

### Error

```json
HTTP 400 | 401 | 500
{
  "error": "Description of the error"
}
```
