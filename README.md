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
| **Platform** | Connects an IM platform — webhook, commands, cards, groups | `feishu`, `slack` |
| **Adapter** | Connects external systems — transforms webhooks, handles auth | `github-adapter`, `jenkins-adapter` |

No Adapter? Just create Topics manually. **Mix and match — only install what you need.**

Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.

### AI-Powered Skills

Skills can optionally use AI. When `AI_ENABLED=true`, Skills that declare `ai: true` in their manifest receive an `AiService` they can call in their lifecycle hooks (e.g., auto-analyzing alerts, generating summaries). The AI provider is pluggable — the default is Volcengine Ark (Doubao Seed model), configurable via environment variables. When AI is unavailable, Skills degrade gracefully — core operations are never blocked.

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

### 3. Install Skills

```bash
# Authenticate with Admin Token
topichub-admin auth tk_xxxxxxxx

# Install a topic type (e.g. "deploy")
topichub-admin skill install topichub-deploy-type
topichub-admin skill enable deploy-type

# Connect an IM platform (e.g. Feishu)
topichub-admin skill install topichub-feishu
topichub-admin skill enable feishu
topichub-admin skill setup feishu   # guided OAuth flow
```

### 4. Start using it

In your IM, type:

```
/topichub create deploy --title "v2.3 Release"
```

A dedicated group is created. The topic card is pinned. Your team is invited. Done.

---

## IM Commands

All end-user interaction happens in IM via `/topichub`.

### Global (work anywhere)

| Command | Description |
|---------|-------------|
| `/topichub create <type> [args]` | Create a topic (auto-creates group or uses current one) |
| `/topichub search --type <t> --status <s>` | Search topics with filters |
| `/topichub help` | List available types and commands |

### Inside a topic group

| Command | Description |
|---------|-------------|
| `/topichub update --status <status>` | Update topic status |
| `/topichub assign @user` | Assign user (auto-invited to group) |
| `/topichub show` | Show topic detail card |
| `/topichub timeline` | Show event history |
| `/topichub reopen` | Reopen a closed topic |
| `/topichub history` | List past topics in this group |

### Status lifecycle

```
open → in_progress → resolved → closed
                                  ↓
                                open (reopen)
```

When a topic is closed, the group stays open for chat but mutation commands are disabled. You can create a new topic in the same group or reopen the existing one.

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

```
my-skills/
├── skills/
│   ├── topics/
│   │   └── incident-handler/
│   │       ├── package.json     # manifest with topichub.category
│   │       ├── SKILL.md         # agent instructions (gray-matter frontmatter)
│   │       ├── src/index.ts     # implements TypeSkill interface
│   │       └── README.md
│   ├── platforms/
│   └── adapters/
├── .cursor/rules/               # AI rules for Cursor
├── AGENTS.md                    # AI guide for Claude Code / Codex
└── .topichub-repo.json          # repo metadata
```

### Manifest Example (Type Skill)

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

Public Skills can also be placed directly in `packages/skills/` (organized by `topics/`, `platforms/`, `adapters/`). The server auto-loads them on startup — no `publish` step needed.

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
| `AI_ENABLED` | `false` | Enable AI for Skills (`true` / `false`) |
| `AI_PROVIDER` | `ark` | AI provider (`ark` for Volcengine) |
| `AI_API_URL` | `https://ark.cn-beijing.volces.com/api/v3` | AI API endpoint (change for internal deployments) |
| `AI_API_KEY` | — | AI API Bearer token |
| `AI_MODEL` | `doubao-seed-2-0-pro-260215` | AI model identifier |
| `AI_TIMEOUT_MS` | `10000` | AI request timeout (ms) |
| `AI_RATE_LIMIT_GLOBAL` | `1000` | Platform-wide AI requests/hour |

### Production checklist

- [ ] Set a strong `ENCRYPTION_KEY` (32+ random bytes, base64 encoded)
- [ ] Use managed MongoDB (Atlas, etc.)
- [ ] Set up HTTPS reverse proxy
- [ ] Install and configure at least one Platform Skill (Feishu / Slack)
- [ ] Install at least one Type Skill (deploy / incident / bug, etc.)
- [ ] Create tenants for each team

---

## License

MIT

