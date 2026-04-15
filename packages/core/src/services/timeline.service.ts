import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { TimelineActionType } from '../common/enums';
import type { TopicHubLogger } from '../common/logger';
import { safeCreate } from '../common/safe-create';

export class TimelineService {
  constructor(
    private readonly timelineModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async append(
    topicId: string | mongoose.Types.ObjectId,
    actor: string,
    actionType: TimelineActionType,
    payload: Record<string, unknown> = {},
  ) {
    return safeCreate(this.timelineModel, {
      topicId,
      actor,
      actionType,
      payload,
    });
  }

  async findByTopic(
    topicId: string,
    page = 1,
    pageSize = 50,
  ) {
    const skip = (page - 1) * pageSize;

    const [entries, total] = await Promise.all([
      this.timelineModel
        .find({ topicId })
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(pageSize)
        .exec(),
      this.timelineModel.countDocuments({ topicId }).exec(),
    ]);

    return { entries, total, page, pageSize };
  }
}
