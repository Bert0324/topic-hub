import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { TimelineEntry } from '../entities/timeline-entry.entity';
import { TimelineActionType } from '../../common/enums';

@Injectable()
export class TimelineService {
  constructor(
    @InjectModel(TimelineEntry.name)
    private readonly timelineModel: ReturnModelType<typeof TimelineEntry>,
  ) {}

  async append(
    tenantId: string,
    topicId: string | mongoose.Types.ObjectId,
    actor: string,
    actionType: TimelineActionType,
    payload: Record<string, unknown> = {},
  ) {
    return this.timelineModel.create({
      tenantId,
      topicId,
      actor,
      actionType,
      payload,
    });
  }

  async findByTopic(
    tenantId: string,
    topicId: string,
    page = 1,
    pageSize = 50,
  ) {
    const skip = (page - 1) * pageSize;

    const [entries, total] = await Promise.all([
      this.timelineModel
        .find({ tenantId, topicId })
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(pageSize)
        .exec(),
      this.timelineModel.countDocuments({ tenantId, topicId }).exec(),
    ]);

    return { entries, total, page, pageSize };
  }
}
