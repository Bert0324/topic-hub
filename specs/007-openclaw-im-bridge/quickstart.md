# Quickstart: OpenClaw IM Bridge

**Date**: 2026-04-10 | **Feature**: 007-openclaw-im-bridge

## Prerequisites

- Topic Hub server running (`@topichub/server`)
- OpenClaw gateway running with at least one IM channel configured (e.g., Lark, Telegram, Slack)
- OpenClaw API token with `send` scope

## Step 1: Configure OpenClaw Connection

Add the OpenClaw configuration to Topic Hub. Choose one method:

### Option A: Environment Variables

```bash
export TOPICHUB_OPENCLAW_GATEWAY_URL="http://localhost:18789"
export TOPICHUB_OPENCLAW_TOKEN="your-openclaw-bearer-token"
export TOPICHUB_OPENCLAW_WEBHOOK_SECRET="your-hmac-secret"
export TOPICHUB_OPENCLAW_TENANT_MAPPING='{"lark-main":{"tenantId":"tenant_abc","platform":"lark"}}'
```

### Option B: TopicHub Config (programmatic)

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/topichub',
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: 'your-openclaw-bearer-token',
    webhookSecret: 'your-hmac-secret',
    tenantMapping: {
      'lark-main': { tenantId: 'tenant_abc', platform: 'lark' },
    },
  },
});
```

## Step 2: Configure OpenClaw Outbound Webhook

In OpenClaw, register an outbound webhook pointing to Topic Hub:

```bash
openclaw webhooks add \
  --url "https://your-topichub-server/webhooks/openclaw" \
  --events "message.received" \
  --secret "your-hmac-secret"
```

This tells OpenClaw to forward all incoming user messages to Topic Hub.

## Step 3: Test Inbound Command

Send a message in any configured IM channel:

```
/topichub create bug --title "Login page returns 500"
```

Expected: Topic Hub receives the webhook, creates a topic, and sends a rich text confirmation back to the IM channel.

## Step 4: Verify Outbound Notifications

Update the topic via the REST API:

```bash
curl -X POST https://your-topichub-server/api/v1/commands \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"rawCommand": "/topichub update --status in_progress", "context": {"tenantId": "tenant_abc"}}'
```

Expected: A rich text notification appears in the mapped IM channel showing the status change.

## Architecture Overview

```
IM Platform (Lark/Slack/Telegram)
       ↕
OpenClaw Gateway (pure relay, no AI)
       ↕
  ┌────┴────┐
  ↓         ↓
Inbound     Outbound
webhook     send API
  ↓         ↑
Topic Hub Server
  ↓         ↑
CommandParser → CommandRouter → Handlers
                                  ↓
                            SkillPipeline
                                  ↓
                           MessageRenderer → OpenClawBridge.send()
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Webhook returns 401 | Verify `webhookSecret` matches between OpenClaw and Topic Hub |
| Webhook returns 400 "Unknown channel" | Add the channel to `tenantMapping` |
| No reply in IM | Check OpenClaw token has `send` scope; verify `gatewayUrl` is reachable |
| Duplicate topic creation | Check dedup cache; verify OpenClaw isn't sending retries faster than 60s apart |
| Commands ignored | Ensure message starts with `/topichub` |
