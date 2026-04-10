import { ApiClient } from '../../api-client/api-client.js';

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 600_000;

export class QaRelay {
  constructor(
    private readonly api: ApiClient,
    private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  ) {}

  async postQuestion(
    dispatchId: string,
    questionText: string,
    questionContext?: { skillName: string; topicTitle: string },
  ): Promise<{ qaId: string; status: string }> {
    return this.api.post(`/api/v1/dispatches/${dispatchId}/question`, {
      questionText,
      questionContext,
    });
  }

  async waitForAnswer(
    dispatchId: string,
    qaId: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.api.get<{ exchanges: any[] }>(
        `/api/v1/dispatches/${dispatchId}/qa?status=answered`,
      );

      const match = result.exchanges.find(
        (ex: any) => String(ex._id) === qaId && ex.answerText,
      );
      if (match) {
        return match.answerText;
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    return null;
  }
}
