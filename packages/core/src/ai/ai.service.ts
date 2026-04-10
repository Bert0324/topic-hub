import { Model } from 'mongoose';
import {
  AiProvider,
  AiProviderError,
  AiResponse,
  AiServiceRequest,
  AiServicePort,
} from './ai-provider.interface';
import { CircuitBreaker } from './circuit-breaker';
import { AiConfig, AI_CONFIG_DEFAULTS } from './ai-config';
import { AiUsageService } from './ai-usage.service';
import type { TopicHubLogger } from '../common/logger';
import type { AiCompletionPort } from '../skill/interfaces/skill-context';

const AI_SKILL_CONFIG_NAME = '__ai__';
const DEFAULT_TENANT_RATE_LIMIT = 100;

export class AiService implements AiServicePort, AiCompletionPort {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly config: AiConfig,
    private readonly provider: AiProvider | null,
    private readonly usageService: AiUsageService | null,
    private readonly tenantConfigModel: Model<any> | null,
    private readonly logger: TopicHubLogger,
  ) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: AI_CONFIG_DEFAULTS.circuitBreakerThreshold,
      cooldownMs: AI_CONFIG_DEFAULTS.circuitBreakerCooldownMs,
    });
  }

  isAvailable(): boolean {
    return this.config.AI_ENABLED && this.provider !== null && !this.circuitBreaker.isOpen();
  }

  getProviderName(): string | null {
    return this.provider?.name ?? null;
  }

  getConfig(): {
    enabled: boolean;
    provider: string | null;
    model: string;
    apiUrl: string | undefined;
    circuitState: string;
  } {
    return {
      enabled: this.config.AI_ENABLED,
      provider: this.provider?.name ?? null,
      model: this.config.AI_MODEL,
      apiUrl: this.config.AI_API_URL,
      circuitState: this.circuitBreaker.getState(),
    };
  }

  async complete(request: AiServiceRequest): Promise<AiResponse | null>;
  async complete(prompt: string, options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
  async complete(
    requestOrPrompt: AiServiceRequest | string,
    options?: { model?: string; maxTokens?: number; temperature?: number },
  ): Promise<any> {
    if (typeof requestOrPrompt === 'string') {
      return this.completeFromPort(requestOrPrompt, options);
    }
    return this.completeFromService(requestOrPrompt);
  }

  private async completeFromPort(
    prompt: string,
    options?: { model?: string; maxTokens?: number; temperature?: number },
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    const request: AiServiceRequest = {
      tenantId: '__port__',
      skillName: '__port__',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: prompt }] },
      ],
      maxOutputTokens: options?.maxTokens,
    };

    const response = await this.completeFromService(request);
    if (!response) {
      return { content: '', usage: { inputTokens: 0, outputTokens: 0 } };
    }

    return {
      content: response.content,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };
  }

  private async completeFromService(request: AiServiceRequest): Promise<AiResponse | null> {
    if (!this.config.AI_ENABLED || !this.provider) {
      return null;
    }

    if (this.circuitBreaker.isOpen()) {
      this.logger.debug(
        `Circuit breaker open — returning null for ${request.skillName}@${request.tenantId}`,
      );
      return null;
    }

    const tenantAiEnabled = await this.isTenantAiEnabled(request.tenantId);
    if (!tenantAiEnabled) {
      this.logger.debug(`AI disabled for tenant ${request.tenantId}`);
      return null;
    }

    const rateLimit = await this.getTenantRateLimit(request.tenantId);
    if (this.usageService) {
      const withinLimit = await this.usageService.checkRateLimit(request.tenantId, rateLimit);
      if (!withinLimit) {
        this.logger.warn(
          `Rate limit exceeded for tenant ${request.tenantId} (limit: ${rateLimit}/hour)`,
        );
        return null;
      }
    }

    const startTime = Date.now();

    try {
      const response = await this.provider.complete({
        input: request.input,
        maxOutputTokens: request.maxOutputTokens,
      });

      this.circuitBreaker.onSuccess();

      if (this.usageService) {
        await this.usageService.recordUsage(
          request.tenantId,
          request.skillName,
          response.usage.totalTokens,
        );
      }

      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `AI call: tenant=${request.tenantId} skill=${request.skillName} ` +
          `tokens=${response.usage.totalTokens} latency=${latencyMs}ms status=success`,
      );

      return response;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const isRetryable = err instanceof AiProviderError && err.retryable;

      if (isRetryable) {
        this.circuitBreaker.onFailure();
      }

      this.logger.error(
        `AI call: tenant=${request.tenantId} skill=${request.skillName} ` +
          `latency=${latencyMs}ms status=error retryable=${isRetryable} ` +
          `error=${(err as Error).message}`,
      );

      return null;
    }
  }

  private async isTenantAiEnabled(tenantId: string): Promise<boolean> {
    if (!this.tenantConfigModel) return true;

    const doc = await this.tenantConfigModel
      .findOne({ tenantId, skillName: AI_SKILL_CONFIG_NAME })
      .lean()
      .exec();

    return (doc as any)?.enabled !== false;
  }

  private async getTenantRateLimit(tenantId: string): Promise<number> {
    if (!this.tenantConfigModel) return DEFAULT_TENANT_RATE_LIMIT;

    const doc = await this.tenantConfigModel
      .findOne({ tenantId, skillName: AI_SKILL_CONFIG_NAME })
      .lean()
      .exec();

    const config = (doc as any)?.config as Record<string, unknown> | undefined;
    return typeof config?.rateLimit === 'number' ? config.rateLimit : DEFAULT_TENANT_RATE_LIMIT;
  }
}
