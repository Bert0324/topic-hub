# @topichub/core

Framework-agnostic core library for TopicHub: topic management, task dispatch, identity, and IM bridge. Embed TopicHub capabilities in any Node.js project — no NestJS or specific framework required.

## Installation

```bash
npm install @topichub/core
```

## Quick Start

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
});

const { topics, total } = await hub.topics.list();
await hub.shutdown();
```

## Configuration

`TopicHub.create(config)` accepts the following options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `mongoUri` | `string` | one of `mongoUri` / `mongoConnection` | — | MongoDB connection string |
| `mongoConnection` | `mongoose.Connection` | one of `mongoUri` / `mongoConnection` | — | Existing Mongoose connection (reuse from host app) |
| `skillsDir` | `string` | no | — | Directory to scan for filesystem-based skills |
| `builtins` | `boolean` | no | `true` | Load built-in skills (set `false` to disable) |
| `ai` | `AiProviderConfig` | no | — | AI provider settings (provider, apiKey, model, baseUrl) |
| `openclaw` | `OpenClawConfig` | no | — | OpenClaw bridge for IM integration (gatewayUrl, token, webhookSecret, channelMapping) |
| `bridge` | `BridgeConfig` | no | — | Auto-managed OpenClaw bridge (spawns gateway as child process) |
| `encryption` | `{ masterKey: string }` | no | — | AES-256 key for encrypting secrets |
| `logger` | `LoggerFactory` | no | console logger | Custom logger factory |

### Usage Patterns

**Minimal setup:**

```typescript
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
});
```

**With OpenClaw IM bridge (external mode):**

```typescript
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: process.env.OPENCLAW_TOKEN!,
    webhookSecret: process.env.OPENCLAW_WEBHOOK_SECRET!,
    channelMapping: {
      'lark-main': 'lark',
    },
  },
});
```

**With auto-managed bridge:**

```typescript
const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  bridge: {
    channels: {
      feishu: { appId: 'cli_xxx', appSecret: 'secret' },
      // discord: { botToken: 'xxx' },
    },
    channelMapping: {
      'lark-main': 'feishu',
    },
    webhookUrl: 'http://localhost:8080/webhooks/openclaw',
  },
});
```

**Reuse host app's MongoDB connection:**

```typescript
import mongoose from 'mongoose';

const conn = mongoose.createConnection('mongodb://localhost:27017/myapp');
const hub = await TopicHub.create({ mongoConnection: conn });
```

## API Overview

`TopicHub` exposes namespace-style surfaces:

| Namespace | Role |
|-----------|------|
| `topics` | List, get, create, update status, tags, assignees |
| `search` | Filtered / text topic search |
| `dispatch` | Async task dispatch for local executors |
| `webhook` | OpenClaw webhook handling (IM inbound) |
| `messaging` | Send messages to IM channels via OpenClaw bridge |
| `identity` | Pairing codes, IM identity binding |
| `heartbeat` | Executor availability tracking |
| `qa` | Human-in-the-loop Q&A relay |
| `superadmin` | Identity and executor management |
| `identityAuth` | Token-based auth resolution |
| `skills` | Skill registry (list registered, check availability) |
| `commands` | Command parsing and execution |
| `ingestion` | Event ingestion into topics |

## OpenClaw IM Bridge

IM platform integration is handled by an [OpenClaw](https://github.com/openclaw/openclaw) bridge — a pure message relay. Two modes are supported:

### Auto-managed mode (recommended)

Core spawns and manages an OpenClaw gateway as a child process:

```typescript
const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  bridge: {
    channels: {
      feishu: { appId: 'cli_xxx', appSecret: 'secret' },
    },
    channelMapping: {
      'lark-main': 'feishu',
    },
    webhookUrl: 'http://localhost:8080/webhooks/openclaw',
  },
});
```

Requires `openclaw` npm package and Node.js >= 22 on host.

### External mode

Connect to a separately deployed OpenClaw gateway:

```typescript
const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: 'your-openclaw-bearer-token',
    webhookSecret: 'your-hmac-secret',
    channelMapping: {
      'lark-main': 'lark',
    },
  },
});
```

If neither `bridge` nor `openclaw` config is provided, IM messaging is disabled.

## Embedding in External Projects

A complete integration needs only one webhook endpoint:

```typescript
import express from 'express';
import { TopicHub } from '@topichub/core';

const app = express();
app.use(express.json());

const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  bridge: {
    channels: {
      feishu: {
        appId: process.env.FEISHU_APP_ID!,
        appSecret: process.env.FEISHU_APP_SECRET!,
      },
    },
    channelMapping: {
      'lark-main': 'feishu',
    },
    webhookUrl: `http://localhost:8080/webhooks/openclaw`,
  },
});

app.post('/webhooks/openclaw', async (req, res) => {
  const result = await hub.webhook.handleOpenClaw(req.body, req.rawBody, req.headers);
  res.json(result);
});

app.listen(8080);
```

On `hub.shutdown()`, the OpenClaw child process is gracefully terminated.

## Requirements

- Node.js 20+ (main process)
- Node.js 22+ on host (for auto-managed OpenClaw gateway child process)
- MongoDB 7 (or compatible)
- `openclaw` npm package (optional — only needed when using `bridge` config)

## Monorepo

Server, CLI, and full docs live in the [topic-hub monorepo](https://github.com/your-org/topic-hub).
