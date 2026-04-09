# Quickstart: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10

## Prerequisites

- Everything from [001-topic-hub-app quickstart](../001-topic-hub-app/quickstart.md)
- A Volcengine Ark API key (or compatible LLM endpoint)

## 1. Configure AI Environment

```bash
export AI_ENABLED=true
export AI_PROVIDER=ark
export AI_API_URL=https://ark.cn-beijing.volces.com/api/v3
export AI_API_KEY=your-api-key-here
export AI_MODEL=doubao-seed-2-0-pro-260215
```

For internal/corporate deployments:
```bash
export AI_API_URL=https://ark.internal.yourcompany.com/api/v3
```

## 2. Start Server

```bash
./start-local.sh
```

## 3. Verify

```bash
curl http://localhost:3000/health
# { "status": "ok", "db": "connected", "ai": "available" }

thub ai status
# ✓ Provider: ark | Model: doubao-seed-2-0-pro-260215 | Status: available
```

## 4. Enable AI for a Tenant

```bash
thub ai enable
# ✓ AI enabled for tenant ten_01
```

## 5. Write an AI-Powered Skill

```typescript
export class SmartAlertSkill implements TypeSkill {
  manifest = {
    name: 'smart-alert-type',
    topicType: 'smart-alert',
    version: '1.0.0',
    ai: true,  // declare AI dependency
    fieldSchema: schema,
    groupNamingTemplate: '🚨 {title}',
    cardTemplate: { /* ... */ },
  };

  private ai: AiService | null = null;

  init(ctx: { aiService: AiService | null }) {
    this.ai = ctx.aiService;
  }

  async onTopicCreated(ctx: TopicContext): Promise<void> {
    if (!this.ai) return; // AI unavailable — graceful fallback

    const response = await this.ai.complete({
      tenantId: ctx.tenantId,
      skillName: this.manifest.name,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Analyze this alert.' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(ctx.topic.metadata) }] },
      ],
    });

    if (!response) return;
    // use response.content, response.usage.totalTokens, etc.
  }

  // ... renderCard, validateMetadata
}
```

## 6. Check Usage

```bash
thub ai usage
```

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| AI_ENABLED | `false` | Master switch |
| AI_PROVIDER | `ark` | Provider |
| AI_API_URL | `https://ark.cn-beijing.volces.com/api/v3` | Change for internal endpoints |
| AI_API_KEY | — | Required when AI_ENABLED=true |
| AI_MODEL | `doubao-seed-2-0-pro-260215` | Model identifier |
| AI_TIMEOUT_MS | `10000` | Per-request timeout |
| AI_RATE_LIMIT_GLOBAL | `1000` | Platform-wide limit/hour |

## Run Tests

```bash
pnpm test                            # All tests
pnpm --filter server test -- ai      # AI module tests only
```
