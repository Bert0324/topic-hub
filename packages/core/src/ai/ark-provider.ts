import {
  AiProvider,
  AiProviderConfig,
  AiProviderError,
  AiRequest,
  AiResponse,
} from './ai-provider.interface';

interface ArkOutputItem {
  type: 'message' | 'reasoning';
  content?: Array<{ type: string; text?: string }>;
  summary?: Array<{ type: string; text?: string }>;
  status: string;
}

interface ArkApiResponse {
  id: string;
  model: string;
  status: string;
  output: ArkOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export class ArkProvider implements AiProvider {
  readonly name = 'ark';

  constructor(private readonly config: AiProviderConfig) {}

  async complete(request: AiRequest): Promise<AiResponse> {
    const url = `${this.config.apiUrl}/responses`;
    const model = request.model ?? this.config.model;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: request.input,
          max_output_tokens: request.maxOutputTokens ?? 32768,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new AiProviderError('Ark API request timed out', undefined, true);
      }
      throw new AiProviderError(
        `Ark API network error: ${(err as Error).message}`,
        undefined,
        true,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiProviderError(
        `Ark API error: ${response.status} ${response.statusText} ${body}`.trim(),
        response.status,
      );
    }

    const data = (await response.json()) as ArkApiResponse;
    return this.mapResponse(data);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'ping' }],
            },
          ],
          max_output_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private mapResponse(data: ArkApiResponse): AiResponse {
    let content = '';
    let reasoning: string | undefined;

    for (const output of data.output) {
      if (output.type === 'message' && output.content) {
        const texts = output.content
          .filter((c) => c.type === 'output_text' && c.text)
          .map((c) => c.text!);
        content += texts.join('');
      }
      if (output.type === 'reasoning' && output.summary) {
        const texts = output.summary
          .filter((s) => s.type === 'summary_text' && s.text)
          .map((s) => s.text!);
        reasoning = texts.join('');
      }
    }

    return {
      id: data.id,
      model: data.model,
      content,
      reasoning: reasoning || undefined,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
