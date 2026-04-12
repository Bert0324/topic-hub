# Quickstart: Topic Hub App

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09

## Prerequisites

- Node.js 20 LTS
- pnpm 9+
- Docker & Docker Compose (for MongoDB)

## One-Command Deploy

```bash
# Clone and start everything
git clone <repo-url> topic-hub && cd topic-hub
docker compose up -d
```

This starts the NestJS server + MongoDB. Skills are mounted from `./skills/` as a volume.

## Local Development

```bash
# Install dependencies
pnpm install

# Start MongoDB only
docker compose up -d mongodb

# Dev mode (hot-reload)
pnpm --filter server dev

# Server starts on http://localhost:3000
# Health check: GET http://localhost:3000/health
```

## Platform Admin Setup

```bash
# Alias for convenience
alias thub='pnpm --filter cli start --'

# 1. Create a tenant
thub tenant create --name "Acme Corp"
# Output: Tenant created!
#   ID: tenant_abc123
#   API Key: ak_xxxxxxxx
#   Admin Token: tk_xxxxxxxx (expires in 30 days)

# 2. Install reference Skills (auto-discovered from skills/ dir)
thub skill list
# Shows: deploy-type (disabled), alert-type (disabled), console-platform (disabled), noop-auth (disabled)
```

## Tenant Admin Setup

```bash
# 1. Authenticate with the tenant token
thub auth tk_xxxxxxxx

# 2. Enable Skills
thub skill enable deploy-type
thub skill enable alert-type

# 3. Setup IM platform (opens browser for OAuth)
thub skill enable feishu-platform
thub skill setup feishu-platform
# → Opens browser for Feishu OAuth
# → Auto-registers webhook URL
# → Credentials encrypted and stored

# 4. Verify
thub skill list
# deploy-type: enabled | alert-type: enabled | feishu-platform: enabled
```

## End User (in IM)

```text
# Create a topic (in any chat)
/topichub create deploy --title "v2.3 Release" --source-url "https://ci.example.com/123"
→ Topic created! Group: [deploy] v2.3 Release

# Inside the topic group:
/topichub update --status in_progress
/topichub assign @alice @bob
/topichub timeline
/topichub show

# Search (from any chat):
/topichub search --type alert --status open
/topichub help
```

## Event Ingestion (External Systems)

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_xxxxxxxx" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release to Production",
    "sourceUrl": "https://ci.example.com/pipelines/123",
    "metadata": { "version": "2.3.0", "environment": "production" },
    "tags": ["production", "release"],
    "assignees": ["alice"]
  }'
```

## User Self-Service Auth (OAuth2 PKCE)

```bash
# When denied permission in IM, user gets a CLI command to copy:
# "Permission denied. Run: topichub-admin auth grant --action 'create deploy'"

# 1. User authenticates via OAuth2 PKCE (opens browser)
thub login
# → Opens browser → IM platform OAuth2 PKCE flow
# → Auth code exchanged for ID token (JWT) + access token
# → Tokens stored in OS keychain (NEVER sent to server)
# ✓ Authenticated as alice@acme.com (via Feishu)

# 2. Run the permission command
thub auth grant --action "create deploy"
# → CLI sends ID token to server
# → Server verifies JWT via IM platform's JWKS endpoint
# → Identity confirmed, permission granted
```

**Security model**: User credentials stay local in OS keychain. Server verifies identity via JWT/JWKS — never receives or stores raw tokens. PKCE prevents auth code interception. Industry-standard, provably secure.

## Run Tests

```bash
pnpm test                           # All tests
pnpm --filter server test           # Server unit tests
pnpm --filter server test:int       # Server integration (mongodb-memory-server)
pnpm --filter cli test              # CLI tests
pnpm --filter sdk test              # SDK tests
```

## Writing a Custom Type Skill

```typescript
import { TypeSkill, TypeSkillManifest, TopicContext, TopicData, CardData, SetupContext } from '@topichub/sdk';
import { z } from 'zod';

const metadataSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'P3']),
  affectedService: z.string(),
  runbookUrl: z.string().url().optional(),
});

export class IncidentTypeSkill implements TypeSkill {
  manifest: TypeSkillManifest = {
    name: 'incident-type',
    topicType: 'incident',
    version: '1.0.0',
    fieldSchema: metadataSchema,
    groupNamingTemplate: '🚨 {title} - {severity}',
    customArgs: [
      { name: 'severity', type: 'string', required: true, description: 'P0-P3' },
      { name: 'affected-service', type: 'string', required: true, description: 'Service name' },
      { name: 'runbook-url', type: 'string', required: false, description: 'Runbook link' },
    ],
    cardTemplate: {
      headerTemplate: '🚨 Incident: {title}',
      fields: [
        { label: 'Severity', value: '{severity}', type: 'badge' },
        { label: 'Service', value: '{affectedService}', type: 'text' },
        { label: 'Runbook', value: '{runbookUrl}', type: 'link' },
      ],
      actions: [
        { label: 'Acknowledge', command: '/topichub update --status in_progress' },
        { label: 'Resolve', command: '/topichub update --status resolved' },
      ],
    },
  };

  renderCard(topic: TopicData): CardData {
    return {
      title: `🚨 Incident: ${topic.title}`,
      fields: [
        { label: 'Severity', value: topic.metadata.severity as string, type: 'badge' },
        { label: 'Service', value: topic.metadata.affectedService as string, type: 'text' },
      ],
      actions: this.manifest.cardTemplate.actions,
      status: topic.status,
    };
  }

  validateMetadata(metadata: unknown) {
    const result = metadataSchema.safeParse(metadata);
    if (result.success) return { valid: true };
    return {
      valid: false,
      errors: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    };
  }

  async onTopicCreated(ctx: TopicContext) {
    // Custom logic on incident creation
  }
}
```

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| MONGODB_URI | mongodb://localhost:27017/topichub | MongoDB connection string |
| PORT | 3000 | Server port |
| ENCRYPTION_KEY | — | AES-256 key for encrypting tenant secrets (required in production) |
| SKILLS_DIR | ./skills | Directory to scan for Skills |
| LOG_FORMAT | json | "json" or "pretty" |
| LOG_LEVEL | info | "debug", "info", "warn", "error" |
| TOKEN_EXPIRY_DAYS | 30 | Default tenant token expiry |
