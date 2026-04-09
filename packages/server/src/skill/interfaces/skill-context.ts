import type { AiService } from '../../ai/ai.service';

export interface SkillContext {
  aiService: AiService | null;
}
