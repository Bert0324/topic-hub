import { z } from 'zod';
import type {
  TypeSkill,
  TypeSkillManifest,
  TopicContext,
  CardData,
  ValidationResult,
  SkillContext,
} from '../../../skill/interfaces';
import type { AiService } from '../../ai.service';
import type { AiResponse } from '../../providers/ai-provider.interface';

const testSchema = z.object({
  description: z.string().optional(),
});

/**
 * Test-only Type Skill that uses AiService.
 * NOT installed in the skills/ directory — used exclusively in integration tests.
 */
export class TestAiSkill implements TypeSkill {
  manifest: TypeSkillManifest = {
    name: 'test-ai-type',
    topicType: 'test-ai',
    version: '0.0.1',
    fieldSchema: testSchema,
    groupNamingTemplate: '[test-ai] {title}',
    cardTemplate: {
      headerTemplate: 'Test AI: {title}',
      fields: [{ label: 'Description', value: '{description}', type: 'text' as const }],
      actions: [],
    },
    ai: true,
  };

  private ai: AiService | null = null;
  public lastAiResponse: AiResponse | null = null;

  init(ctx: SkillContext): void {
    this.ai = ctx.aiService;
  }

  async onTopicCreated(ctx: TopicContext): Promise<void> {
    if (!this.ai) return;

    const response = await this.ai.complete({
      tenantId: ctx.tenantId,
      skillName: this.manifest.name,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'Analyze the following topic and provide a brief assessment.' }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(ctx.topic) }],
        },
      ],
    });

    this.lastAiResponse = response;
  }

  renderCard(topic: any): CardData {
    return {
      title: `Test AI: ${topic.title}`,
      fields: [
        { label: 'Description', value: topic.metadata?.description ?? '', type: 'text' },
      ],
      status: topic.status,
    };
  }

  validateMetadata(metadata: unknown): ValidationResult {
    const result = testSchema.safeParse(metadata);
    if (result.success) return { valid: true };
    return {
      valid: false,
      errors: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    };
  }
}
