import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Topic } from '../entities/topic.entity';
import { TimelineEntry } from '../entities/timeline-entry.entity';
import { TopicStatus, TimelineActionType } from '../../common/enums';

interface CreateTopicData {
  type: string;
  title: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  groupInfo?: {
    platform: string;
    groupId: string;
    groupUrl?: string;
  };
}

const VALID_TRANSITIONS: Record<TopicStatus, TopicStatus[]> = {
  [TopicStatus.OPEN]: [TopicStatus.IN_PROGRESS, TopicStatus.CLOSED],
  [TopicStatus.IN_PROGRESS]: [TopicStatus.RESOLVED, TopicStatus.OPEN, TopicStatus.CLOSED],
  [TopicStatus.RESOLVED]: [TopicStatus.CLOSED, TopicStatus.OPEN],
  [TopicStatus.CLOSED]: [TopicStatus.OPEN],
};

@Injectable()
export class TopicService {
  constructor(
    @InjectModel(Topic.name)
    private readonly topicModel: ReturnModelType<typeof Topic>,
    @InjectModel(TimelineEntry.name)
    private readonly timelineModel: ReturnModelType<typeof TimelineEntry>,
  ) {}

  async create(tenantId: string, data: CreateTopicData) {
    if (data.groupInfo) {
      const existing = await this.findActiveTopicByGroup(
        tenantId,
        data.groupInfo.platform,
        data.groupInfo.groupId,
      );
      if (existing) {
        throw new ConflictException(
          `Active topic already exists for group ${data.groupInfo.platform}/${data.groupInfo.groupId}`,
        );
      }
    }

    const topic = await this.topicModel.create({
      tenantId,
      type: data.type,
      title: data.title,
      sourceUrl: data.sourceUrl,
      metadata: data.metadata ?? {},
      createdBy: data.createdBy,
      groups: data.groupInfo
        ? [
            {
              platform: data.groupInfo.platform,
              groupId: data.groupInfo.groupId,
              groupUrl: data.groupInfo.groupUrl,
            },
          ]
        : [],
    });

    await this.timelineModel.create({
      tenantId,
      topicId: topic._id,
      actor: data.createdBy,
      actionType: TimelineActionType.CREATED,
      payload: { title: data.title, type: data.type },
    });

    return topic;
  }

  async findById(tenantId: string, id: string) {
    return this.topicModel.findOne({ _id: id, tenantId }).exec();
  }

  async updateStatus(
    tenantId: string,
    id: string,
    newStatus: TopicStatus,
    actor: string,
  ) {
    const topic = await this.topicModel
      .findOne({ _id: id, tenantId })
      .exec();
    if (!topic) return null;

    const allowed = VALID_TRANSITIONS[topic.status];
    if (!allowed?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${topic.status} to ${newStatus}`,
      );
    }

    const oldStatus = topic.status;
    topic.status = newStatus;

    if (
      newStatus === TopicStatus.CLOSED ||
      newStatus === TopicStatus.RESOLVED
    ) {
      topic.closedAt = new Date();
    }

    if (newStatus === TopicStatus.OPEN) {
      topic.closedAt = undefined;
    }

    await topic.save();

    await this.timelineModel.create({
      tenantId,
      topicId: topic._id,
      actor,
      actionType:
        newStatus === TopicStatus.OPEN && oldStatus === TopicStatus.CLOSED
          ? TimelineActionType.REOPENED
          : TimelineActionType.STATUS_CHANGED,
      payload: { from: oldStatus, to: newStatus },
    });

    return topic;
  }

  async assignUser(tenantId: string, id: string, userId: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id, tenantId },
        {
          $addToSet: {
            assignees: { userId, assignedAt: new Date() },
          },
        },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        tenantId,
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.ASSIGNED,
        payload: { userId },
      });
    }

    return topic;
  }

  async addTag(tenantId: string, id: string, tag: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id, tenantId },
        { $addToSet: { tags: tag } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        tenantId,
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.TAG_ADDED,
        payload: { tag },
      });
    }

    return topic;
  }

  async removeTag(tenantId: string, id: string, tag: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id, tenantId },
        { $pull: { tags: tag } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        tenantId,
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.TAG_REMOVED,
        payload: { tag },
      });
    }

    return topic;
  }

  async attachSignal(
    tenantId: string,
    id: string,
    signal: { label: string; url?: string; description?: string },
    actor: string,
  ) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id, tenantId },
        { $push: { signals: { ...signal, createdAt: new Date() } } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        tenantId,
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.SIGNAL_ATTACHED,
        payload: { label: signal.label },
      });
    }

    return topic;
  }

  async findBySourceUrl(tenantId: string, sourceUrl: string) {
    return this.topicModel.findOne({ tenantId, sourceUrl }).exec();
  }

  async findActiveTopicByGroup(
    tenantId: string,
    platform: string,
    groupId: string,
  ) {
    return this.topicModel
      .findOne({
        tenantId,
        'groups.platform': platform,
        'groups.groupId': groupId,
        status: { $in: [TopicStatus.OPEN, TopicStatus.IN_PROGRESS] },
      })
      .exec();
  }

  async findGroupHistory(
    tenantId: string,
    platform: string,
    groupId: string,
  ) {
    return this.topicModel
      .find({
        tenantId,
        'groups.platform': platform,
        'groups.groupId': groupId,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async upsertBySourceUrl(tenantId: string, data: CreateTopicData) {
    const result = await this.topicModel
      .findOneAndUpdate(
        { tenantId, sourceUrl: data.sourceUrl },
        {
          $set: {
            type: data.type,
            title: data.title,
            metadata: data.metadata ?? {},
            createdBy: data.createdBy,
          },
          $setOnInsert: {
            tenantId,
            sourceUrl: data.sourceUrl,
            status: TopicStatus.OPEN,
            groups: data.groupInfo
              ? [
                  {
                    platform: data.groupInfo.platform,
                    groupId: data.groupInfo.groupId,
                    groupUrl: data.groupInfo.groupUrl,
                    createdAt: new Date(),
                  },
                ]
              : [],
            assignees: [],
            tags: [],
            signals: [],
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    return result;
  }
}
