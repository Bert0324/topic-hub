import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { AiService } from './ai.service';
import { AiUsageService } from './usage/ai-usage.service';
import { TenantSkillConfig } from '../skill/entities/tenant-skill-config.entity';

const AI_SKILL_CONFIG_NAME = '__ai__';
const DEFAULT_RATE_LIMIT = 100;

@Controller('admin')
export class AiAdminController {
  constructor(
    private readonly aiService: AiService,
    private readonly usageService: AiUsageService,
    @InjectModel(TenantSkillConfig.name)
    private readonly tenantConfigModel: ReturnModelType<typeof TenantSkillConfig>,
  ) {}

  @Get('ai/status')
  getStatus() {
    const config = this.aiService.getConfig();

    if (!config.enabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      provider: config.provider,
      model: config.model,
      apiUrl: config.apiUrl,
      available: this.aiService.isAvailable(),
      circuitState: config.circuitState,
    };
  }

  @Get('tenants/:tid/ai')
  async getTenantAiConfig(@Param('tid') tenantId: string) {
    const doc = await this.tenantConfigModel
      .findOne({ tenantId, skillName: AI_SKILL_CONFIG_NAME })
      .lean()
      .exec();

    const config = doc?.config as Record<string, unknown> | undefined;
    const rateLimit =
      typeof config?.rateLimit === 'number' ? config.rateLimit : DEFAULT_RATE_LIMIT;
    const usageThisHour = await this.usageService.getUsageThisHour(tenantId);

    return {
      tenantId,
      aiEnabled: doc?.enabled !== false,
      rateLimit,
      usageThisHour,
    };
  }

  @Patch('tenants/:tid/ai')
  async updateTenantAiConfig(
    @Param('tid') tenantId: string,
    @Body() body: { enabled?: boolean; rateLimit?: number },
  ) {
    const update: Record<string, unknown> = {};

    if (body.enabled !== undefined) {
      update.enabled = body.enabled;
    }

    if (body.rateLimit !== undefined) {
      update['config.rateLimit'] = body.rateLimit;
    }

    await this.tenantConfigModel
      .findOneAndUpdate(
        { tenantId, skillName: AI_SKILL_CONFIG_NAME },
        { $set: update },
        { upsert: true, new: true },
      )
      .exec();

    return { tenantId, ...body };
  }

  @Get('tenants/:tid/ai/usage')
  async getTenantAiUsage(
    @Param('tid') tenantId: string,
    @Query('hours') hours?: string,
  ) {
    const h = hours ? parseInt(hours, 10) : 24;
    const usage = await this.usageService.getUsageForTenant(tenantId, h);
    const usageThisHour = await this.usageService.getUsageThisHour(tenantId);

    const doc = await this.tenantConfigModel
      .findOne({ tenantId, skillName: AI_SKILL_CONFIG_NAME })
      .lean()
      .exec();

    const config = doc?.config as Record<string, unknown> | undefined;
    const rateLimit =
      typeof config?.rateLimit === 'number' ? config.rateLimit : DEFAULT_RATE_LIMIT;

    return {
      tenantId,
      period: `last ${h} hours`,
      totalRequests: usage.totalRequests,
      totalTokens: usage.totalTokens,
      bySkill: usage.bySkill,
      limit: {
        requestsPerHour: rateLimit,
        usedThisHour: usageThisHour,
        remaining: Math.max(0, rateLimit - usageThisHour),
      },
    };
  }
}
