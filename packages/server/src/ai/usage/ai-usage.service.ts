import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { AiUsageRecord } from './ai-usage.entity';

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsageRecord.name)
    private readonly usageModel: ReturnModelType<typeof AiUsageRecord>,
  ) {}

  async checkRateLimit(tenantId: string, limitPerHour: number): Promise<boolean> {
    const periodStart = this.currentHourBucket();

    const result = await this.usageModel
      .aggregate<{ total: number }>([
        { $match: { tenantId, periodStart } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ])
      .exec();

    const currentCount = result[0]?.total ?? 0;
    return currentCount < limitPerHour;
  }

  async recordUsage(
    tenantId: string,
    skillName: string,
    tokensUsed: number,
  ): Promise<void> {
    const periodStart = this.currentHourBucket();

    await this.usageModel
      .findOneAndUpdate(
        { tenantId, skillName, periodStart },
        { $inc: { count: 1, totalTokens: tokensUsed } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async getUsageForTenant(
    tenantId: string,
    hours: number = 24,
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    bySkill: Array<{ skillName: string; requests: number; tokens: number }>;
  }> {
    const since = new Date();
    since.setHours(since.getHours() - hours);
    const sinceHour = this.hourBucket(since);

    const result = await this.usageModel
      .aggregate<{ _id: string; total: number; tokens: number }>([
        { $match: { tenantId, periodStart: { $gte: sinceHour } } },
        {
          $group: {
            _id: '$skillName',
            total: { $sum: '$count' },
            tokens: { $sum: '$totalTokens' },
          },
        },
      ])
      .exec();

    const bySkill = result.map((r) => ({
      skillName: r._id,
      requests: r.total,
      tokens: r.tokens,
    }));

    const totalRequests = bySkill.reduce((sum, s) => sum + s.requests, 0);
    const totalTokens = bySkill.reduce((sum, s) => sum + s.tokens, 0);

    return { totalRequests, totalTokens, bySkill };
  }

  async getUsageThisHour(tenantId: string): Promise<number> {
    const periodStart = this.currentHourBucket();

    const result = await this.usageModel
      .aggregate<{ total: number }>([
        { $match: { tenantId, periodStart } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ])
      .exec();

    return result[0]?.total ?? 0;
  }

  private currentHourBucket(): Date {
    return this.hourBucket(new Date());
  }

  private hourBucket(date: Date): Date {
    const bucket = new Date(date);
    bucket.setMinutes(0, 0, 0);
    return bucket;
  }
}
