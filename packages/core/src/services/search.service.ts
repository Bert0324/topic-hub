import { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';

export interface SearchFilters {
  type?: string;
  status?: string;
  tags?: string[];
  q?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export class SearchService {
  constructor(
    private readonly topicModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async search(
    filters: SearchFilters,
  ): Promise<{ results: any[]; total: number }> {
    const query: Record<string, any> = {};

    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.tags?.length) query.tags = { $all: filters.tags };

    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = filters.from;
      if (filters.to) query.createdAt.$lte = filters.to;
    }

    if (filters.q) {
      query.$text = { $search: filters.q };
    }

    const skip = (filters.page - 1) * filters.pageSize;

    const [results, total] = await Promise.all([
      this.topicModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.pageSize)
        .exec(),
      this.topicModel.countDocuments(query).exec(),
    ]);

    return { results, total };
  }
}
