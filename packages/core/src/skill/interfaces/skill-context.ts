export interface AiCompletionPort {
  complete(prompt: string, options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
}

export interface SkillContext {
  aiService: AiCompletionPort | null;
}
