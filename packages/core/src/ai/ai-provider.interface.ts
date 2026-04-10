export interface AiProviderConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: AiContentPart[];
}

export type AiContentPart = { type: 'input_text'; text: string };

export interface AiRequest {
  model?: string;
  input: AiMessage[];
  maxOutputTokens?: number;
}

export interface AiResponse {
  id: string;
  model: string;
  content: string;
  reasoning?: string;
  usage: AiUsage;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiRequest): Promise<AiResponse>;
  isAvailable(): Promise<boolean>;
}

export class AiProviderError extends Error {
  public readonly retryable: boolean;

  constructor(
    message: string,
    public readonly statusCode?: number,
    retryable?: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.retryable = retryable ?? (statusCode !== undefined && statusCode >= 500);
  }
}

export interface AiServiceRequest {
  tenantId: string;
  skillName: string;
  input: AiMessage[];
  maxOutputTokens?: number;
}

export interface AiServicePort {
  complete(request: AiServiceRequest): Promise<AiResponse | null>;
}
