# AI Provider Interface Contract

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10

## Provider Interface

```typescript
interface AiProviderConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: AiContentPart[];
}

type AiContentPart = { type: 'input_text'; text: string };

interface AiRequest {
  model?: string;
  input: AiMessage[];
  maxOutputTokens?: number;
}

interface AiResponse {
  id: string;
  model: string;
  content: string;
  reasoning?: string;
  usage: AiUsage;
}

interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AiProvider {
  readonly name: string;
  complete(request: AiRequest): Promise<AiResponse>;
  isAvailable(): Promise<boolean>;
}
```

## AiService (Public API for Skills)

```typescript
interface AiServiceRequest {
  tenantId: string;
  skillName: string;
  input: AiMessage[];
  maxOutputTokens?: number;
}

class AiService {
  /**
   * Returns null when AI is unavailable, disabled, circuit open, or rate limited.
   * Never throws (except for programming errors like missing tenantId).
   */
  complete(request: AiServiceRequest): Promise<AiResponse | null>;

  /** Check if AI is currently available at the platform level. */
  isAvailable(): boolean;
}
```

## Ark Provider (Volcengine)

```typescript
class ArkProvider implements AiProvider {
  readonly name = 'ark';

  async complete(request: AiRequest): Promise<AiResponse> {
    // POST ${config.apiUrl}/responses
    // Authorization: Bearer ${config.apiKey}
    // Body: { model, input, max_output_tokens }
    // Maps response.output[].type === 'message' → content
    // Maps response.output[].type === 'reasoning' → reasoning
    // Maps response.usage → usage
  }
}
```

## Error Type

```typescript
class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.retryable = statusCode ? statusCode >= 500 : false;
  }
}
```

## How Skills Access AiService

```typescript
// Skill manifest declares AI dependency
interface SkillManifest {
  // ... existing fields
  ai?: boolean;
}

// SkillRegistry passes AiService during init
interface SkillContext {
  aiService: AiService | null;
}

// Example usage in a Type Skill
class MySkill implements TypeSkill {
  private ai: AiService | null = null;

  init(ctx: SkillContext) {
    this.ai = ctx.aiService;
  }

  async onTopicCreated(ctx: TopicContext): Promise<void> {
    if (!this.ai) return;
    const response = await this.ai.complete({
      tenantId: ctx.tenantId,
      skillName: this.manifest.name,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Analyze...' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(ctx.topic.metadata) }] },
      ],
    });
    if (!response) return;
    // use response.content
  }
}
```
