import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { QaExchangeStatus } from '../common/enums';
import type { TopicHubLogger } from '../common/logger';
import { QA_REMINDER_MS, QA_TIMEOUT_MS } from '../identity/identity-types';

export class QaService {
  constructor(
    private readonly qaModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async createQuestion(
    tenantId: string,
    dispatchId: string,
    topichubUserId: string,
    questionText: string,
    questionContext: { skillName: string; topicTitle: string } | undefined,
    sourceChannel: string,
    sourcePlatform: string,
  ): Promise<any> {
    const now = new Date();
    const doc = await this.qaModel.create({
      tenantId,
      dispatchId: new mongoose.Types.ObjectId(dispatchId),
      topichubUserId,
      questionText,
      ...(questionContext !== undefined ? { questionContext } : {}),
      status: QaExchangeStatus.PENDING,
      sourceChannel,
      sourcePlatform,
      questionedAt: now,
    });

    this.logger.log(
      `QA question created: ${doc._id} dispatch=${dispatchId} user=${topichubUserId}`,
    );

    return doc;
  }

  async findPendingByDispatch(dispatchId: string): Promise<any[]> {
    return this.qaModel
      .find({
        dispatchId: new mongoose.Types.ObjectId(dispatchId),
        status: QaExchangeStatus.PENDING,
      })
      .sort({ questionedAt: 1 })
      .exec();
  }

  async findPendingByUser(topichubUserId: string): Promise<any | null> {
    return this.qaModel
      .findOne({
        topichubUserId,
        status: QaExchangeStatus.PENDING,
      })
      .sort({ questionedAt: -1 })
      .exec();
  }

  async findAllPendingByUser(topichubUserId: string): Promise<any[]> {
    return this.qaModel
      .find({
        topichubUserId,
        status: QaExchangeStatus.PENDING,
      })
      .sort({ questionedAt: 1 })
      .exec();
  }

  async submitAnswer(qaId: string, answerText: string): Promise<any | null> {
    return this.qaModel
      .findOneAndUpdate(
        { _id: qaId, status: QaExchangeStatus.PENDING },
        {
          $set: {
            answerText,
            status: QaExchangeStatus.ANSWERED,
            answeredAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async findAnsweredByDispatch(dispatchId: string): Promise<any[]> {
    return this.qaModel
      .find({
        dispatchId: new mongoose.Types.ObjectId(dispatchId),
        status: QaExchangeStatus.ANSWERED,
      })
      .sort({ answeredAt: 1 })
      .exec();
  }

  async findByDispatchAndStatus(dispatchId: string, status?: string): Promise<any[]> {
    const filter: Record<string, unknown> = {
      dispatchId: new mongoose.Types.ObjectId(dispatchId),
    };
    if (status) {
      filter.status = status;
    }
    return this.qaModel
      .find(filter)
      .sort({ questionedAt: 1 })
      .exec();
  }

  async getExpiredForReminder(): Promise<any[]> {
    const cutoff = new Date(Date.now() - QA_REMINDER_MS);
    return this.qaModel
      .find({
        status: QaExchangeStatus.PENDING,
        questionedAt: { $lt: cutoff },
        reminderSentAt: null,
      })
      .exec();
  }

  async markReminderSent(qaId: string): Promise<any | null> {
    return this.qaModel
      .findOneAndUpdate(
        { _id: qaId, status: QaExchangeStatus.PENDING },
        { $set: { reminderSentAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async getExpiredForTimeout(): Promise<any[]> {
    const cutoff = new Date(Date.now() - QA_TIMEOUT_MS);
    return this.qaModel
      .find({
        status: QaExchangeStatus.PENDING,
        questionedAt: { $lt: cutoff },
      })
      .exec();
  }

  async markTimedOut(qaId: string): Promise<any | null> {
    return this.qaModel
      .findOneAndUpdate(
        { _id: qaId, status: QaExchangeStatus.PENDING },
        { $set: { status: QaExchangeStatus.TIMED_OUT } },
        { new: true },
      )
      .exec();
  }
}
