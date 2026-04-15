/** Overrides for the OpenClaw-compatible noop completion payload. */
export type ChatCompletionNoopOptions = {
  id?: string;
  model?: string;
};

export type ChatCompletionNoopResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: 'stop';
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/** Static JSON for `POST /v1/chat/completions` bridge compatibility. */
export function buildChatCompletionNoopResponse(
  options?: ChatCompletionNoopOptions,
): ChatCompletionNoopResponse {
  return {
    id: options?.id ?? 'chatcmpl-noop',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: options?.model ?? 'noop',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
