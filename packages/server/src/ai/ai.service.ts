import { Injectable, Logger } from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import {
  AiProvider,
  AiProviderError,
  AiResponse,
  AiServiceRequest,
} from './providers/ai-provider.interface';
import { CircuitBreaker } from './circuit-breaker';
import { AiConfig, AI_CONFIG_DEFAULTS } from './ai-config';
import { AiUsageService } from './usage/ai-usage.service';
import { TenantSkillConfig } from '../skill/entities/tenant-skill-config.entity';

export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';
export const AI_CONFIG_TOKEN = 'AI_CONFIG';
const AI_SKILL_CONFIG_NAME = '__ai__';
const DEFAULT_TENANT_RATE_LIMIT = 100;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    @Inject(AI_CONFIG_TOKEN) private readonly config: AiConfig,
    @Optional() @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider | null,
    @Optional() private readonly usageService: AiUsageService | null,
    @Optional()
    @InjectModel(TenantSkillConfig.name)
    private readonly tenantConfigModel: ReturnModelType<typeof TenantSkillConfig> | null,
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

  async complete(request: AiServiceRequest): Promise<AiResponse | null> {
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

    return doc?.enabled !== false;
  }

  private async getTenantRateLimit(tenantId: string): Promise<number> {
    if (!this.tenantConfigModel) return DEFAULT_TENANT_RATE_LIMIT;

    const doc = await this.tenantConfigModel
      .findOne({ tenantId, skillName: AI_SKILL_CONFIG_NAME })
      .lean()
      .exec();

    const config = doc?.config as Record<string, unknown> | undefined;
    return typeof config?.rateLimit === 'number' ? config.rateLimit : DEFAULT_TENANT_RATE_LIMIT;
  }
}
