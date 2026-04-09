# Quickstart: AI-Driven Skills

## Prerequisites

- Node.js 20 LTS
- MongoDB 7 running (local or remote)
- pnpm 9+
- AI provider credentials (Volcengine Ark API key)

## 1. Configure AI Environment Variables

Add to your `.env` or export directly:

```bash
export AI_ENABLED=true
export AI_PROVIDER=ark
export AI_API_URL=https://ark.cn-beijing.volces.com/api/v3
export AI_API_KEY=your-ark-api-key
export AI_MODEL=doubao-seed-2-0-pro-260215
export AI_TIMEOUT_MS=10000
```

For internal/corporate deployments (internal-remote mode):
```bash
export AI_API_URL=https://your-internal-ark-endpoint.corp.example.com/api/v3
```

## 2. Start the Server

```bash
# Local development (with Docker MongoDB)
./start-local.sh

# Or with remote MongoDB
./start-remote.sh
```

## 3. Verify AI Status

```bash
# Via health endpoint
curl http://localhost:3000/health
# Expected: { "status": "ok", "ai": "available" }

# Via CLI
npx topichub-admin ai status
```

## 4. Create a SKILL.md-Based Skill

Create a skill directory in `./skills/`:

```bash
mkdir -p skills/alert-triage
```

Create `skills/alert-triage/package.json`:
```json
{
  "name": "alert-triage",
  "version": "1.0.0",
  "main": "index.js"
}
```

Create `skills/alert-triage/SKILL.md`:
```markdown
---
name: alert-triage
description: >-
  Analyze alert topics and generate severity assessments with
  first-responder action suggestions. Use for alert-type topics.
---

# Alert Triage

You are an incident triage assistant. Analyze the alert topic data
and produce a severity assessment.

Output format:

**Severity**: P0-P4
**Impact**: Brief summary of impact
**Actions**:
- Suggested action 1
- Suggested action 2

## onTopicCreated

Perform a full triage of the new alert. Assess severity based on
the topic metadata, title, and any signals attached.

## onTopicStatusChanged

Briefly note how the status change affects the triage assessment.
If moving to resolved/closed, summarize the resolution.
```

Create `skills/alert-triage/index.js` (minimal — SKILL.md handles AI):
```javascript
const { z } = require('zod');

module.exports = {
  manifest: {
    name: 'alert-triage',
    topicType: 'alert',
    version: '1.0.0',
    fieldSchema: z.object({
      severity: z.string().optional(),
      source: z.string().optional(),
    }),
    groupNamingTemplate: '[Alert] {title}',
    cardTemplate: {
      headerTemplate: 'Alert: {title}',
      fields: [
        { label: 'Severity', value: '{severity}', type: 'badge' },
        { label: 'Source', value: '{source}', type: 'text' },
      ],
      actions: [],
    },
    ai: true,
  },
  renderCard(topic) {
    return {
      title: `Alert: ${topic.title}`,
      fields: [
        { label: 'Severity', value: topic.metadata?.severity ?? 'Unknown', type: 'badge' },
        { label: 'Source', value: topic.metadata?.source ?? '', type: 'text' },
      ],
      status: topic.status,
    };
  },
  validateMetadata(metadata) {
    return { valid: true };
  },
};
```

## 5. Enable AI for a Tenant

```bash
npx topichub-admin ai enable --tenant <tenant-id>
```

## 6. Restart the Server

The server loads skills at startup:
```bash
# Ctrl+C and restart, or:
pnpm --filter @topichub/server run dev
```

## 7. Test It

Create a topic of type `alert` and verify:
1. The topic timeline shows an `ai_response` entry from the `alert-triage` skill
2. The topic metadata contains `_ai.alert-triage` with the AI assessment
3. `topichub-admin ai usage --tenant <tid>` shows the request

## Development Workflow

```bash
# Install dependencies
pnpm install

# Run server in dev mode
pnpm --filter @topichub/server run dev

# Run tests
pnpm --filter @topichub/server run test

# Run integration tests
pnpm --filter @topichub/server run test:integration

# Lint
pnpm --filter @topichub/server run lint
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/server/src/skill/registry/skill-md-parser.ts` | Parse SKILL.md files |
| `packages/server/src/skill/pipeline/skill-ai-runtime.ts` | Prompt assembly + AI invocation |
| `packages/server/src/skill/pipeline/skill-pipeline.ts` | Pipeline orchestration |
| `packages/server/src/ai/ai.service.ts` | Core AI service (circuit breaker, rate limiting) |
| `packages/server/src/ai/providers/ark-provider.ts` | Volcengine Ark API client |
