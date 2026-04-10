---
name: lark-bot
description: Lark (Feishu) custom bot integration for pushing topic notifications to group chats via webhook
platform: lark
executor: none
---

# Lark Custom Bot Platform Skill

This skill integrates Topic Hub with Lark (飞书) group chats using the
[custom bot webhook API](https://open.larkoffice.com/document/client-docs/bot-v3/add-custom-bot).

## Capabilities

- **Push notifications**: Send topic cards and text messages to Lark group chats.
- **Signature verification**: Optional HmacSHA256 signing for outbound requests.
- **Interactive cards**: Renders `CardData` as Lark interactive cards (schema 2.0) with
  markdown fields, status-colored headers, and URL-based action buttons.

## Limitations

Lark custom bots are push-only. They **cannot**:
- Receive or respond to user messages (no inbound webhook).
- Manage groups (create, invite members).
- Handle callback-based card interactions (buttons only support URL jumps).

For bidirectional interaction, use a Lark App Bot instead.

## Setup

Run `topichub init` and select the `lark` platform. You will be prompted for:

1. **Webhook URL** — obtained when adding a custom bot to a Lark group.
   Format: `https://open.feishu.cn/open-apis/bot/v2/hook/<token>`
2. **Signing secret** (optional) — if signature verification is enabled on the bot.

## Security Settings

The Lark custom bot supports three security modes (configured in Lark, not in Topic Hub):

| Mode | Description |
|------|-------------|
| Custom keywords | Messages must contain at least one configured keyword |
| IP whitelist | Only whitelisted IPs can call the webhook |
| Signature verification | Requests must include a valid HmacSHA256 signature |

When signature verification is enabled, this skill automatically signs every outbound
request with `timestamp + "\n" + secret` using HmacSHA256 + Base64.

## Message Types

| Type | `msg_type` | Used for |
|------|-----------|----------|
| Text | `text` | Simple notifications via `sendMessage` |
| Interactive card | `interactive` | Topic cards via `postCard` with fields and actions |

## Rate Limits

Lark enforces per-tenant per-bot limits: **100 requests/min**, **5 requests/sec**.
Avoid sending at exact half-hour marks (e.g. 10:00, 17:30) to prevent throttling (error 11232).
Request body must not exceed 20 KB.
