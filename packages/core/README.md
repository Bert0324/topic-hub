# @topichub/core

Framework-agnostic core library for TopicHub: event topics, skill pipeline, AI-driven workflows, commands, search, and dispatch. Embed TopicHub capabilities in any Node.js project — no NestJS or specific framework required.

## Installation

```bash
npm install @topichub/core
```

## Quick Start

```typescript
import { TopicHub } from '@topichub/core';

// Minimal — built-in generic type skill is loaded automatically
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
});

const { topics, total } = await hub.topics.list('tenant-id');
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
| `openclaw` | `OpenClawConfig` | no | — | OpenClaw bridge for IM integration (gatewayUrl, token, webhookSecret, tenantMapping) |
| `encryption` | `{ masterKey: string }` | no | — | AES-256 key for encrypting tenant secrets |
| `logger` | `LoggerFactory` | no | console logger | Custom logger factory |

### Usage Patterns

**Zero-config — built-in skills only:**

```typescript
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
});
```

**Filesystem skills only (no builtins):**

```typescript
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
  builtins: false,
  skillsDir: './my-skills',
});
```

**Builtins + filesystem skills + OpenClaw IM bridge:**

```typescript
const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
  skillsDir: './skills',
  ai: {
    provider: 'ark',
    apiKey: process.env.ARK_API_KEY!,
  },
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: process.env.OPENCLAW_TOKEN!,
    webhookSecret: process.env.OPENCLAW_WEBHOOK_SECRET!,
    tenantMapping: {
      'lark-main': { tenantId: 'tenant_abc', platform: 'lark' },
    },
  },
});
```

**Reuse host app's MongoDB connection:**

```typescript
import mongoose from 'mongoose';

const conn = mongoose.createConnection('mongodb://localhost:27017/myapp');
const hub = await TopicHub.create({ mongoConnection: conn });
```

### Skill Loading Order

Skills are loaded in two stages. Later stages override earlier ones when names collide:

1. **Built-in skills** — SKILL.md-based skills shipped with `@topichub/core` (unless `builtins: false`)
2. **Filesystem skills** — scanned from `skillsDir` (if provided)

## Built-in Skills

`@topichub/core` ships with SKILL.md-based built-in skills. These are md-only skills — all logic is expressed as natural-language AI instructions, no code.

| Skill | Category | Topic Type | Description |
|-------|----------|------------|-------------|
| `generic-type` | type | `generic` | General-purpose topic type with description, priority, labels, and standard status transitions (open → in_progress → resolved → closed) |

Built-in skills are available out of the box. Override them by placing a skill with the same name in your `skillsDir`.

You can access the built-in skill definitions:

```typescript
import { getBuiltinSkills, GENERIC_TYPE_SKILL_MD } from '@topichub/core';

// Get all built-in skill entries (name, mdContent, version)
const builtins = getBuiltinSkills();

// Access the raw SKILL.md content
console.log(GENERIC_TYPE_SKILL_MD);
```

## API Overview

`TopicHub` exposes namespace-style surfaces:

| Namespace    | Role |
|-------------|------|
| `topics`    | List, get, create, update status, tags, assignees |
| `commands`  | Parse and execute slash-style commands |
| `ingestion` | Ingest events into topics |
| `webhook`   | Adapter and OpenClaw webhook handling |
| `messaging` | Send messages to IM channels via OpenClaw bridge |
| `auth`      | Resolve tenant from API key |
| `search`    | Filtered / text topic search |
| `skills`    | List registered skills, check type availability |
| `dispatch`  | Async task dispatch for agents |

## OpenClaw IM Bridge

IM platform integration is handled by a built-in OpenClaw bridge. [OpenClaw](https://github.com/openclaw/openclaw) acts as a pure message relay — no AI processing at the bridge layer.

**Inbound**: OpenClaw receives messages from IM platforms (Lark, Slack, Telegram, etc.) and forwards them to Topic Hub via the `message.received` outbound webhook. Topic Hub parses `/topichub` commands, executes them, and sends a reply.

**Outbound**: When topic lifecycle events occur, Topic Hub renders markdown notifications and sends them to all IM channels mapped to the tenant via OpenClaw's send API.

```typescript
const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: 'your-openclaw-bearer-token',
    webhookSecret: 'your-hmac-secret',
    tenantMapping: {
      'lark-main': { tenantId: 'tenant_abc', platform: 'lark' },
      'slack-eng': { tenantId: 'tenant_abc', platform: 'slack' },
    },
  },
});

// Handle inbound OpenClaw webhook (POST /webhooks/openclaw)
const result = await hub.webhook.handleOpenClaw(payload, rawBody);

// Send a message to an IM channel
await hub.messaging.send('lark', {
  tenantId: 'tenant_abc',
  groupId: 'lark-main',
  message: '**Topic updated**: status changed to in_progress',
});
```

If `openclaw` config is omitted, the bridge is disabled and IM messaging is unavailable (all other TopicHub features still work).

## Embedding in External Projects

`@topichub/core` is designed to be embedded in any Node.js service:

```typescript
import express from 'express';
import { TopicHub } from '@topichub/core';

const app = express();
app.use(express.json());

const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  openclaw: {
    gatewayUrl: process.env.OPENCLAW_URL!,
    token: process.env.OPENCLAW_TOKEN!,
    webhookSecret: process.env.OPENCLAW_SECRET!,
    tenantMapping: JSON.parse(process.env.OPENCLAW_TENANT_MAPPING || '{}'),
  },
});

app.post('/api/topichub/events', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  const result = await hub.ingestion.ingest(tenantId, req.body);
  res.json(result);
});

// OpenClaw inbound webhook
app.post('/webhooks/openclaw', async (req, res) => {
  const result = await hub.webhook.handleOpenClaw(req.body, JSON.stringify(req.body));
  res.json(result);
});

// Adapter webhooks (GitHub, Jira, etc.)
app.post('/webhooks/:platform', async (req, res) => {
  const result = await hub.webhook.handle(req.params.platform, req.body, req.headers as any);
  res.json(result);
});

app.listen(8080);
```

## Requirements

- Node.js 20+
- MongoDB 7 (or compatible)

## Monorepo

Server, CLI, and full docs live in the [topic-hub monorepo](https://github.com/your-org/topic-hub).
