<p align="center">
  <h1 align="center">Topic Hub</h1>
  <p align="center">
    <strong>Turn events into trackable topics. Turn group chats into collaboration spaces.</strong>
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#im-integration">IM Integration</a> &bull;
  <a href="#custom-skills">Custom Skills</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## The Problem

When teams handle events — deploys, incidents, alerts — information scatters everywhere. CI sends a notification, someone @-mentions a few people in a shared channel, discussion gets buried in daily chatter, and eventually nobody knows whether the issue was actually resolved.

**Topic Hub gives every event its own group chat, its own status, its own lifecycle. Everything is trackable.**

## Core Concepts

### Topic

A Topic is something your team needs to track — a deploy, an incident, a bug. Each Topic has:

- **Status lifecycle** — `open → in_progress → resolved → closed`, reopen anytime
- **Metadata** — structured fields for type-specific data
- **Groups** — linked IM channels for context
- **Assignees, Tags, Signals** — flexible organization

### Skill

Topic Hub is an engine. All actual capabilities come from **Skill** plugins that run on the **local execution engine**:

| Category | What it does | Examples |
|----------|--------------|---------|
| **Type** | Defines a topic type — fields, card template, lifecycle hooks | `deploy-type`, `incident-type` |
| **Adapter** | Connects external systems — transforms webhooks, handles auth | `github-adapter`, `jenkins-adapter` |

Skills are executed locally by a connected agent (e.g. Cursor, Claude Code, Codex). The server only handles topic storage and task dispatch — all skill logic runs on your machine.

### IM Integration (OpenClaw Bridge)

IM platform connectivity (Lark, Slack, Telegram, Discord, etc.) is handled by the built-in **OpenClaw bridge**. [OpenClaw](https://github.com/openclaw/openclaw) is an open-source multi-channel gateway that acts as a pure message relay:

- **Inbound**: Users `@bot` in any IM → OpenClaw forwards to Topic Hub → messages are dispatched to the local execution engine
- **Outbound**: Server sends messages back to IM channels via OpenClaw's send API

Adding a new IM platform requires only configuring a channel in OpenClaw — **zero code changes in Topic Hub**.

### Architecture

```
IM (Lark/Discord/...) ←→ OpenClaw Bridge ←→ Topic Hub Server ←→ Local Executor
                                                    ↕
                                                 MongoDB
```

The server is a **thin dispatch layer**: it stores topics, distributes tasks via SSE, and relays IM messages. All intelligence lives in local skills.

---

## Quick Start

### 1. Deploy

```bash
git clone https://github.com/your-org/topic-hub.git && cd topic-hub
docker compose up -d
```

Server + MongoDB running at `http://localhost:3000`.

### 2. Initialize

```bash
# Set up superadmin identity
topichub-admin init
```

### 3. Connect IM via OpenClaw

```bash
# Set OpenClaw connection (env vars or config file)
export TOPICHUB_OPENCLAW_GATEWAY_URL="http://localhost:18789"
export TOPICHUB_OPENCLAW_TOKEN="your-openclaw-token"
export TOPICHUB_OPENCLAW_WEBHOOK_SECRET="your-hmac-secret"
export TOPICHUB_CHANNEL_MAPPING='{"lark-main":"lark","1234567890":"discord"}'

# Register Topic Hub webhook in OpenClaw
openclaw webhooks add \
  --url "http://localhost:3000/webhooks/openclaw" \
  --events "message.received" \
  --secret "your-hmac-secret"
```

### 4. Link your local executor

In your IM, type `/register`. Then in your terminal:

```bash
topichub-admin link <pairing-code>
topichub-admin serve --executor cursor
```

Now `@bot` in any connected channel — your message is dispatched to your local agent for processing.

---

## IM Integration

Users interact by `@bot` in any IM platform connected through OpenClaw. Messages are forwarded to the local execution engine for processing.

### Built-in Commands

A few server-side commands are recognized directly (no `/topichub` prefix needed):

| Command | Description |
|---------|-------------|
| `/register` | Link your IM identity to a local executor |
| `/unregister` | Unlink your IM identity |
| `/answer [#N] <text>` | Reply to a pending Q&A question from your agent |

All other messages are forwarded as-is to your local execution engine for skill-based processing.

### Status lifecycle

```
open → in_progress → resolved → closed
                                  ↓
                                open (reopen)
```

---

## CLI Admin Commands

`topichub-admin` is the command-line tool for administrators and developers.

### Authentication

```bash
topichub-admin auth <token>          # authenticate with identity token
topichub-admin login                 # OAuth2 login (opens browser)
```

### Skill management

```bash
topichub-admin skill list                   # list installed Skills
topichub-admin skill install <pkg>          # install from path (server-local)
topichub-admin skill enable <name>          # enable a skill
topichub-admin skill disable <name>         # disable a skill
topichub-admin skill setup <name>           # guided setup (OAuth, etc.)
topichub-admin skill config <name> --show   # view config (secrets masked)
```

### Skill development

```bash
topichub-admin init                         # configure server URL and identity
topichub-admin skill-repo create <name>     # create a skill repo project
topichub-admin skill create                 # scaffold a skill (interactive Q&A)
topichub-admin publish                      # publish skills
topichub-admin publish --dry-run            # validate without publishing
```

### Local agent

```bash
topichub-admin serve --executor cursor      # start local execution engine
topichub-admin link <code>                  # link IM identity via pairing code
```

### Utilities

```bash
topichub-admin health                # check service status
topichub-admin stats                 # view platform statistics
```

---

## REST API

### Topics

```bash
# Create a topic
curl -X POST http://localhost:3000/api/v1/topics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <executor-token>" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release",
    "sourceUrl": "https://ci.example.com/123",
    "metadata": { "version": "2.3.0", "environment": "production" }
  }'

# Search topics
curl http://localhost:3000/api/v1/topics?type=deploy&status=open \
  -H "Authorization: Bearer <executor-token>"
```

### Dispatch (for local executors)

```bash
# Poll for tasks (SSE)
curl http://localhost:3000/api/v1/dispatch/stream \
  -H "Authorization: Bearer <executor-token>"

# Claim a task
curl -X POST http://localhost:3000/api/v1/dispatch/<id>/claim \
  -H "Authorization: Bearer <executor-token>"
```

---

## Custom Skills

### Unified Workflow (recommended)

```bash
# 1. Set up CLI
topichub-admin init

# 2. Create a skill repo
topichub-admin skill-repo create my-skills
cd my-skills

# 3. Create a skill (interactive Q&A)
topichub-admin skill create

# 4. Develop (AI-assisted — open in Cursor / Claude Code / Codex)
cursor .

# 5. Test locally
topichub-admin serve --executor claude-code

# 6. Publish
topichub-admin publish
```

The scaffolded repo includes AI agent skill files (`.cursor/rules/`, `AGENTS.md`) that teach your AI coding tool how to write Topic Hub skills.

### Skill Structure

Skills come in two flavors:

**Code skills** — full TypeScript implementation with custom logic:

```
my-skills/
├── skills/
│   ├── topics/
│   │   └── incident-handler/
│   │       ├── package.json     # manifest with topichub.category + main
│   │       ├── SKILL.md         # agent instructions (gray-matter frontmatter)
│   │       ├── src/index.ts     # implements TypeSkill interface
│   │       └── README.md
│   └── adapters/
├── .cursor/rules/               # AI rules for Cursor
├── AGENTS.md                    # AI guide for Claude Code / Codex
└── .topichub-repo.json          # repo metadata
```

**Md-only skills** — just a SKILL.md, no code needed:

```
my-skills/
├── skills/
│   └── topics/
│       └── github-trends/
│           └── SKILL.md         # frontmatter + AI instructions (that's it!)
```

### Md-Only Skill Example

Create a skill with just a single SKILL.md file. All logic is expressed as
natural-language instructions for the AI agent:

```yaml
---
name: github-trends
description: Tracks GitHub trending repos and enriches topics with analysis
topicType: github-trend
executor: cursor
maxTurns: 8
allowedTools:
  - topichub_update_topic
---

# GitHub Trends Tracker

You are a GitHub trends analysis agent. When a github-trend topic
is created or updated, analyze and enrich it.

## onTopicCreated

1. Read the repo URL from topic metadata.
2. Fetch the repository's current stats.
3. Classify the repo by domain and add tags.

## onTopicUpdated

Re-check the repository stats and note any changes.
```

### Code Skill Manifest Example

```json
{
  "name": "incident-handler",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "type",
    "topicType": "incident",
    "hooks": ["created", "updated"]
  }
}
```

---

## Embeddable Library (`@topichub/core`)

You can embed TopicHub directly into your existing Node.js service — no separate deployment required.

```bash
npm install @topichub/core
```

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
  openclaw: {
    gatewayUrl: 'http://localhost:18789',
    token: process.env.OPENCLAW_TOKEN!,
    webhookSecret: process.env.OPENCLAW_SECRET!,
    channelMapping: {
      'lark-main': 'lark',
    },
  },
});

// Single webhook endpoint — handles all IM inbound messages
app.post('/webhooks/openclaw', async (req, res) => {
  const result = await hub.webhook.handleOpenClaw(req.body, req.rawBody, req.headers);
  res.json(result);
});
```

See [`packages/core/README.md`](./packages/core/README.md) for full API documentation and embedding examples.

---

## Deployment

### Docker Compose (recommended)

```bash
git clone https://github.com/your-org/topic-hub.git && cd topic-hub
docker compose up -d
```

Starts MongoDB 7 + Topic Hub server at `http://localhost:3000`.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/topichub` | MongoDB connection string |
| `PORT` | `3000` | Server port |
| `MASTER_SECRET` | — | Derives encryption key + token secret via HKDF (**required in production**) |
| `SKILLS_DIR` | `./skills` | Skills directory |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| **OpenClaw Bridge** | | |
| `TOPICHUB_OPENCLAW_GATEWAY_URL` | — | OpenClaw gateway URL. If unset, IM messaging is disabled. |
| `TOPICHUB_OPENCLAW_TOKEN` | — | Bearer token for OpenClaw API authentication |
| `TOPICHUB_OPENCLAW_WEBHOOK_SECRET` | — | HMAC-SHA256 secret for verifying inbound OpenClaw webhooks |
| `TOPICHUB_CHANNEL_MAPPING` | — | JSON mapping of channel IDs to platform names (e.g., `{"lark-main":"lark"}`) |
| **Auto-managed Bridge** | | |
| `TOPICHUB_BRIDGE_WEBHOOK_URL` | — | Webhook URL for embedded bridge mode |
| `TOPICHUB_BRIDGE_FEISHU_APP_ID` | — | Feishu app ID |
| `TOPICHUB_BRIDGE_FEISHU_APP_SECRET` | — | Feishu app secret |
| `TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN` | — | Discord bot token |

### Production checklist

- [ ] Set a strong `MASTER_SECRET`
- [ ] Use managed MongoDB (Atlas, etc.)
- [ ] Set up HTTPS reverse proxy
- [ ] Deploy and configure OpenClaw gateway with your IM channels
- [ ] Set `TOPICHUB_OPENCLAW_*` or `TOPICHUB_BRIDGE_*` environment variables
- [ ] Register Topic Hub webhook in OpenClaw (`webhooks add --url .../webhooks/openclaw`)
- [ ] Install topic type skills (deploy / incident / bug, etc.)

---

## License

MIT
