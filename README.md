<p align="center">
  <h1 align="center">Topic Hub</h1>
  <p align="center">
    <strong>Turn events into trackable topics. Turn group chats into collaboration spaces.</strong>
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#im-commands">Commands</a> &bull;
  <a href="#custom-skills">Custom Skills</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## The Problem

When teams handle events — deploys, incidents, alerts — information scatters everywhere. CI sends a notification, someone @-mentions a few people in a shared channel, discussion gets buried in daily chatter, and eventually nobody knows whether the issue was actually resolved.

**Topic Hub gives every event its own group chat, its own status, its own timeline. Everything is trackable.**

## Core Concepts

### Topic

A Topic is something your team needs to track — a deploy, an incident, a bug. Each Topic automatically gets:

- **A dedicated IM group** — no more context lost in shared channels
- **Status lifecycle** — `open → in_progress → resolved → closed`, reopen anytime
- **Timeline** — who did what and when, recorded automatically
- **Info card** — pinned in the group, all key details at a glance

### Skill

Topic Hub is just an engine. All actual capabilities come from **Skill** plugins:

| Category | What it does | Examples |
|----------|--------------|---------|
| **Type** | Defines a topic type — fields, card template, lifecycle hooks | `deploy-type`, `incident-type` |
| **Adapter** | Connects external systems — transforms webhooks, handles auth | `github-adapter`, `jenkins-adapter` |

No Adapter? Just create Topics manually. **Mix and match — only install what you need.**

Skills can be full TypeScript packages or **md-only** (just a `SKILL.md` file with AI instructions — no code required). Skills are organized by category: `skills/topics/`, `skills/adapters/`.

### IM Platform Integration (OpenClaw Bridge)

IM platform connectivity (Lark, Slack, Telegram, Discord, etc.) is handled by the built-in **OpenClaw bridge** — not by skills. [OpenClaw](https://github.com/openclaw/openclaw) is an open-source multi-channel gateway that acts as a pure message relay:

- **Inbound**: Users send `/topichub` commands in any IM → OpenClaw forwards to Topic Hub via webhook → commands are parsed and executed
- **Outbound**: Topic lifecycle events → Topic Hub renders markdown notifications → sends to IM channels via OpenClaw's send API

Adding a new IM platform requires only configuring a channel in OpenClaw — **zero code changes in Topic Hub**.

### Tenant

One deployment serves many teams. Each team gets isolated data, independent Skill config, and their own IM app credentials. Teams are invisible to each other.

---

## Quick Start

### 1. Deploy

```bash
git clone https://github.com/your-org/topic-hub.git && cd topic-hub
docker compose up -d
```

Server + MongoDB running at `http://localhost:3000`.

### 2. Create a tenant

```bash
topichub-admin tenant create --name "My Team"
# ✅ Tenant created!
#    ID:          tenant_abc123
#    API Key:     ak_xxxxxxxx
#    Admin Token: tk_xxxxxxxx (expires in 30 days)
```

### 3. Connect IM via OpenClaw

```bash
# Set OpenClaw connection (env vars or config file)
export TOPICHUB_OPENCLAW_GATEWAY_URL="http://localhost:18789"
export TOPICHUB_OPENCLAW_TOKEN="your-openclaw-token"
export TOPICHUB_OPENCLAW_WEBHOOK_SECRET="your-hmac-secret"
export TOPICHUB_OPENCLAW_TENANT_MAPPING='{"lark-main":{"tenantId":"tenant_abc123","platform":"lark"}}'

# Register Topic Hub webhook in OpenClaw
openclaw webhooks add \
  --url "http://localhost:3000/webhooks/openclaw" \
  --events "message.received" \
  --secret "your-hmac-secret"
```

### 4. Install Skills & Start Using

```bash
# Install a topic type (e.g. "deploy")
topichub-admin skill install topichub-deploy-type
topichub-admin skill enable deploy-type
```

In your IM (Lark, Slack, Telegram, etc.), type:

```
/topichub create deploy --title "v2.3 Release"
```

Topic Hub creates the topic and sends a rich text confirmation back to the IM channel.

---

## IM Commands

All end-user interaction happens in IM via `/topichub`. Commands work in any IM platform connected through OpenClaw.

### Global (work anywhere)

| Command | Description |
|---------|-------------|
| `/topichub create <type> [args]` | Create a topic |
| `/topichub search --type <t> --status <s>` | Search topics with filters |
| `/topichub help` | List available types and commands |

### Topic-scoped

| Command | Description |
|---------|-------------|
| `/topichub update --status <status>` | Update topic status |
| `/topichub assign @user` | Assign user |
| `/topichub show` | Show topic details |
| `/topichub timeline` | Show event history |
| `/topichub reopen` | Reopen a closed topic |
| `/topichub history` | List past topics |

### Status lifecycle

```
open → in_progress → resolved → closed
                                  ↓
                                open (reopen)
```

Topic lifecycle events (create, update, status change, assign, close, reopen) automatically trigger rich text notifications to all IM channels configured for the tenant.

---

## CLI Admin Commands

`topichub-admin` is the command-line tool for administrators.

### Authentication

```bash
topichub-admin auth <token>          # authenticate with Admin Token
topichub-admin login                 # OAuth2 login (opens browser)
```

### Skill management

```bash
topichub-admin skill list                   # list installed Skills
topichub-admin skill list --scope private   # list only private Skills
topichub-admin skill list --category adapter  # filter by category
topichub-admin skill install <pkg>          # install from path (server-local)
topichub-admin skill enable <name>          # enable for your tenant
topichub-admin skill disable <name>         # disable
topichub-admin skill setup <name>           # guided setup (OAuth, etc.)
topichub-admin skill config <name> --show   # view config (secrets masked)
```

### Skill development

```bash
topichub-admin init                         # configure server URL, token, tenant
topichub-admin skill-repo create <name>     # create a skill repo project
topichub-admin skill create                 # scaffold a skill (interactive Q&A)
topichub-admin publish                      # publish all skills in repo (private)
topichub-admin publish --public             # publish as public (super-admin only)
topichub-admin publish --dry-run            # validate without publishing
```

### Group management

```bash
topichub-admin group create <name> --platform <p> --members <ids>  # create IM group
```

### Tenant management

```bash
topichub-admin tenant create --name "Team Name"
topichub-admin tenant list
```

### AI management

```bash
topichub-admin ai status             # check AI provider health
topichub-admin ai enable             # enable AI for your tenant
topichub-admin ai disable            # disable AI for your tenant
topichub-admin ai config --show      # view AI config and rate limit
topichub-admin ai usage              # view AI usage stats
```

### Utilities

```bash
topichub-admin health                # check service status
topichub-admin stats                 # view platform statistics
```

---

## Event Ingestion API

Push events from external systems via API:

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <tenant-api-key>" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release",
    "sourceUrl": "https://ci.example.com/123",
    "metadata": { "version": "2.3.0", "environment": "production" }
  }'
```

If `sourceUrl` matches an existing topic, it updates instead of creating a duplicate.

Or install an Adapter Skill and point your GitHub / Jenkins webhooks directly at Topic Hub — zero code:

```
https://your-hub.com/webhooks/adapter/github
```

---

## Custom Skills

### Unified Workflow (recommended)

Both public and private Skills use the same development flow:

```bash
# 1. Set up CLI
topichub-admin init

# 2. Create a skill repo
topichub-admin skill-repo create my-skills
cd my-skills

# 3. Create a skill (interactive Q&A)
topichub-admin skill create
# ? Skill name: incident-handler
# ? Category: Topic Type
# ? Topic type name: incident
# ? Lifecycle hooks: created, updated

# 4. Develop (AI-assisted — open in Cursor / Claude Code / Codex)
cursor .

# 5. Test locally
topichub-admin serve --executor claude-code

# 6. Publish
topichub-admin publish              # private (your tenant only)
topichub-admin publish --public     # public (all tenants, super-admin only)
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
  - topichub_add_timeline
---

# GitHub Trends Tracker

You are a GitHub trends analysis agent. When a github-trend topic
is created or updated, analyze and enrich it.

## onTopicCreated

1. Read the repo URL from topic metadata.
2. Fetch the repository's current stats.
3. Classify the repo by domain and add tags.
4. Post an analysis summary to the timeline.

## onTopicUpdated

Re-check the repository stats and note any changes.
```

The system auto-generates a TypeSkill stub with `ai: true`, generic card
rendering, and permissive metadata validation. No TypeScript code required.

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

### Direct Server Loading (public Skills shortcut)

Public Skills can also be placed directly in `packages/skills/` (organized by `topics/`, `adapters/`). The server auto-loads them on startup — no `publish` step needed.

```bash
topichub-admin skill install ./packages/skills/topics/incident-handler
topichub-admin skill enable incident-handler
```

### AI-Powered Skill Example

Add `ai: true` to your manifest and implement `init()` to receive `AiService`:

```typescript
export default {
  manifest: {
    name: 'smart-alert-type',
    topicType: 'smart-alert',
    version: '1.0.0',
    ai: true,  // opt-in to AI
    // ... fieldSchema, cardTemplate, etc.
  },

  init(ctx) {
    this.ai = ctx.aiService;  // null if AI is unavailable
  },

  async onTopicCreated(ctx) {
    if (!this.ai) return;  // graceful fallback
    const response = await this.ai.complete({
      tenantId: ctx.tenantId,
      skillName: this.manifest.name,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Analyze this alert.' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(ctx.topic.metadata) }] },
      ],
    });
    if (response) {
      // use response.content for AI-generated insights
    }
  },
  // ...
};
```

---

## Embeddable Library (`@topichub/core`)

You can embed TopicHub directly into your existing Node.js service — no separate deployment required.

```bash
npm install @topichub/core
```

### Zero-Config Start

`@topichub/core` ships with built-in skills, so you can get started with just a MongoDB connection:

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: 'mongodb://localhost:27017/myapp',
});

// Built-in "generic" topic type is available immediately
await hub.ingestion.ingest('my-tenant', {
  type: 'generic',
  title: 'Something happened',
});
```

### Full Configuration

```typescript
import { TopicHub } from '@topichub/core';

const hub = await TopicHub.create({
  mongoUri: process.env.MONGODB_URI!,
  skillsDir: './skills',          // filesystem skills (optional)
  builtins: true,                 // load built-in skills (default: true)
  openclaw: {                     // IM bridge (optional)
    gatewayUrl: 'http://localhost:18789',
    token: process.env.OPENCLAW_TOKEN!,
    webhookSecret: process.env.OPENCLAW_SECRET!,
    tenantMapping: {
      'lark-main': { tenantId: 'tenant_abc', platform: 'lark' },
    },
  },
});
```

Skills are loaded in two stages (later stages override earlier ones):

1. **Built-in skills** — SKILL.md-based skills shipped with `@topichub/core` (disable with `builtins: false`)
2. **Filesystem skills** — scanned from a `skillsDir` directory

### Built-in Skills

| Skill | Type | Description |
|-------|------|-------------|
| `generic-type` | topic type | General-purpose topic with description, priority, labels, and standard status flow |

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
| `ENCRYPTION_KEY` | — | AES-256 key for tenant secrets (**required in production**) |
| `SKILLS_DIR` | `./skills` | Skills directory |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TOKEN_EXPIRY_DAYS` | `30` | Admin Token expiry in days |
| **OpenClaw Bridge** | | |
| `TOPICHUB_OPENCLAW_GATEWAY_URL` | — | OpenClaw gateway URL (e.g., `http://localhost:18789`). If unset, IM messaging is disabled. |
| `TOPICHUB_OPENCLAW_TOKEN` | — | Bearer token for OpenClaw API authentication |
| `TOPICHUB_OPENCLAW_WEBHOOK_SECRET` | — | HMAC-SHA256 secret for verifying inbound OpenClaw webhooks |
| `TOPICHUB_OPENCLAW_TENANT_MAPPING` | — | JSON mapping of OpenClaw channels to tenants (e.g., `{"lark-main":{"tenantId":"t1","platform":"lark"}}`) |

### Production checklist

- [ ] Set a strong `ENCRYPTION_KEY` (32+ random bytes, base64 encoded)
- [ ] Use managed MongoDB (Atlas, etc.)
- [ ] Set up HTTPS reverse proxy
- [ ] Deploy and configure OpenClaw gateway with your IM channels
- [ ] Set `TOPICHUB_OPENCLAW_*` environment variables
- [ ] Register Topic Hub webhook in OpenClaw (`webhooks add --url .../webhooks/openclaw`)
- [ ] Install at least one Type Skill (deploy / incident / bug, etc.)
- [ ] Create tenants and configure tenant-channel mapping

---

## License

MIT

