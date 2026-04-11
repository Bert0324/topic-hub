import { Model } from 'mongoose';
import { TopicStatus, TimelineActionType } from '../common/enums';
import { ConflictError, ValidationError } from '../common/errors';
import type { TopicHubLogger } from '../common/logger';

export interface CreateTopicData {
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

export const VALID_TRANSITIONS: Record<TopicStatus, TopicStatus[]> = {
  [TopicStatus.OPEN]: [TopicStatus.IN_PROGRESS, TopicStatus.CLOSED],
  [TopicStatus.IN_PROGRESS]: [TopicStatus.RESOLVED, TopicStatus.OPEN, TopicStatus.CLOSED],
  [TopicStatus.RESOLVED]: [TopicStatus.CLOSED, TopicStatus.OPEN],
  [TopicStatus.CLOSED]: [TopicStatus.OPEN],
};

export class TopicService {
  constructor(
    private readonly topicModel: Model<any>,
    private readonly timelineModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async create(data: CreateTopicData) {
    if (data.groupInfo) {
      const existing = await this.findActiveTopicByGroup(
        data.groupInfo.platform,
        data.groupInfo.groupId,
      );
      if (existing) {
        throw new ConflictError(
          `Active topic already exists for group ${data.groupInfo.platform}/${data.groupInfo.groupId}`,
        );
      }
    }

    const topic = await this.topicModel.create({
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
      topicId: topic._id,
      actor: data.createdBy,
      actionType: TimelineActionType.CREATED,
      payload: { title: data.title, type: data.type },
    });

    return topic;
  }

  async findById(id: string) {
    return this.topicModel.findOne({ _id: id }).exec();
  }

  async updateStatus(
    id: string,
    newStatus: TopicStatus,
    actor: string,
  ) {
    const topic = await this.topicModel
      .findOne({ _id: id })
      .exec();
    if (!topic) return null;

    const allowed = VALID_TRANSITIONS[topic.status as TopicStatus];
    if (!allowed?.includes(newStatus)) {
      throw new ValidationError(
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

  async assignUser(id: string, userId: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id },
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
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.ASSIGNED,
        payload: { userId },
      });
    }

    return topic;
  }

  async addTag(id: string, tag: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id },
        { $addToSet: { tags: tag } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.TAG_ADDED,
        payload: { tag },
      });
    }

    return topic;
  }

  async removeTag(id: string, tag: string, actor: string) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id },
        { $pull: { tags: tag } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.TAG_REMOVED,
        payload: { tag },
      });
    }

    return topic;
  }

  async attachSignal(
    id: string,
    signal: { label: string; url?: string; description?: string },
    actor: string,
  ) {
    const topic = await this.topicModel
      .findOneAndUpdate(
        { _id: id },
        { $push: { signals: { ...signal, createdAt: new Date() } } },
        { new: true },
      )
      .exec();

    if (topic) {
      await this.timelineModel.create({
        topicId: topic._id,
        actor,
        actionType: TimelineActionType.SIGNAL_ATTACHED,
        payload: { label: signal.label },
      });
    }

    return topic;
  }

  async findBySourceUrl(sourceUrl: string) {
    return this.topicModel.findOne({ sourceUrl }).exec();
  }

  async findActiveTopicByGroup(
    platform: string,
    groupId: string,
  ) {
    return this.topicModel
      .findOne({
        'groups.platform': platform,
        'groups.groupId': groupId,
        status: { $ne: TopicStatus.CLOSED },
      })
      .exec();
  }

  async findGroupHistory(
    platform: string,
    groupId: string,
  ) {
    return this.topicModel
      .find({
        'groups.platform': platform,
        'groups.groupId': groupId,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async upsertBySourceUrl(data: CreateTopicData) {
    const result = await this.topicModel
      .findOneAndUpdate(
        { sourceUrl: data.sourceUrl },
        {
          $set: {
            type: data.type,
            title: data.title,
            metadata: data.metadata ?? {},
            createdBy: data.createdBy,
          },
          $setOnInsert: {
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
