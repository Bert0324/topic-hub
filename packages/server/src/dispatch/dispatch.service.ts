import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Subject } from 'rxjs';
import mongoose from 'mongoose';
import { TaskDispatch } from './entities/task-dispatch.entity';
import { DispatchStatus } from '../common/enums';
import type { EnrichedPayload } from './entities/task-dispatch.entity';

const CLAIM_TTL_MS = 5 * 60 * 1000;
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;

export interface CreateDispatchDto {
  tenantId: string;
  topicId: string;
  eventType: string;
  skillName: string;
  enrichedPayload: EnrichedPayload;
}

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  readonly newDispatch$ = new Subject<TaskDispatch>();
  private expiryTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(TaskDispatch.name)
    private readonly dispatchModel: ReturnModelType<typeof TaskDispatch>,
  ) {}

  onModuleInit() {
    this.expiryTimer = setInterval(
      () => this.releaseExpired().catch((err) => this.logger.error('Expiry check failed', err)),
      EXPIRY_CHECK_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async create(dto: CreateDispatchDto): Promise<TaskDispatch> {
    const dispatch = await this.dispatchModel.create({
      tenantId: dto.tenantId,
      topicId: new mongoose.Types.ObjectId(dto.topicId),
      eventType: dto.eventType,
      skillName: dto.skillName,
      status: DispatchStatus.UNCLAIMED,
      retryCount: 0,
      enrichedPayload: dto.enrichedPayload,
    });

    this.newDispatch$.next(dispatch);
    this.logger.log(
      `Dispatch created: ${dispatch._id} skill=${dto.skillName} topic=${dto.topicId}`,
    );

    return dispatch;
  }

  async findUnclaimed(
    tenantId: string,
    options?: { limit?: number; since?: Date },
  ): Promise<TaskDispatch[]> {
    const filter: Record<string, unknown> = {
      tenantId,
      status: DispatchStatus.UNCLAIMED,
    };
    if (options?.since) {
      filter.createdAt = { $gt: options.since };
    }

    return this.dispatchModel
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(options?.limit ?? 20)
      .exec();
  }

  async claim(
    dispatchId: string,
    claimedBy: string,
  ): Promise<TaskDispatch | null> {
    const claimExpiry = new Date(Date.now() + CLAIM_TTL_MS);

    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId, status: DispatchStatus.UNCLAIMED },
        {
          $set: {
            status: DispatchStatus.CLAIMED,
            claimedBy,
            claimExpiry,
          },
        },
        { new: true },
      )
      .exec();
  }

  async complete(
    dispatchId: string,
    result: { text: string; executorType: string; tokenUsage?: { input: number; output: number }; durationMs: number },
  ): Promise<TaskDispatch | null> {
    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId, status: DispatchStatus.CLAIMED },
        {
          $set: {
            status: DispatchStatus.COMPLETED,
            result,
            completedAt: new Date(),
            claimExpiry: null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async fail(
    dispatchId: string,
    error: string,
    retryable = false,
  ): Promise<TaskDispatch | null> {
    const dispatch = await this.dispatchModel.findById(dispatchId).exec();
    if (!dispatch || dispatch.status !== DispatchStatus.CLAIMED) return null;

    const shouldRetry =
      retryable && dispatch.retryCount < TaskDispatch.MAX_RETRY_COUNT;

    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId },
        {
          $set: {
            status: shouldRetry
              ? DispatchStatus.UNCLAIMED
              : DispatchStatus.FAILED,
            error,
            claimedBy: shouldRetry ? null : dispatch.claimedBy,
            claimExpiry: null,
          },
          $inc: { retryCount: 1 },
        },
        { new: true },
      )
      .exec();
  }

  async releaseExpired(): Promise<number> {
    const now = new Date();

    const result = await this.dispatchModel
      .updateMany(
        {
          status: DispatchStatus.CLAIMED,
          claimExpiry: { $lt: now },
          retryCount: { $lt: TaskDispatch.MAX_RETRY_COUNT },
        },
        {
          $set: {
            status: DispatchStatus.UNCLAIMED,
            claimedBy: null,
            claimExpiry: null,
          },
          $inc: { retryCount: 1 },
        },
      )
      .exec();

    const released = result.modifiedCount;
    if (released > 0) {
      this.logger.warn(`Released ${released} expired dispatch claim(s)`);
    }

    // Fail dispatches that exceeded max retries
    await this.dispatchModel
      .updateMany(
        {
          status: DispatchStatus.CLAIMED,
          claimExpiry: { $lt: now },
          retryCount: { $gte: TaskDispatch.MAX_RETRY_COUNT },
        },
        {
          $set: {
            status: DispatchStatus.FAILED,
            error: 'Max retries exceeded',
            claimExpiry: null,
          },
        },
      )
      .exec();

    return released;
  }

  async countByStatus(
    tenantId: string,
  ): Promise<Record<DispatchStatus, number>> {
    const results = await this.dispatchModel
      .aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();

    const counts = {
      [DispatchStatus.UNCLAIMED]: 0,
      [DispatchStatus.CLAIMED]: 0,
      [DispatchStatus.COMPLETED]: 0,
      [DispatchStatus.FAILED]: 0,
    };

    for (const r of results) {
      counts[r._id as DispatchStatus] = r.count;
    }

    return counts;
  }
}
