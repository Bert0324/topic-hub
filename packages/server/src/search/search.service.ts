import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Topic } from '../core/entities/topic.entity';

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

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Topic.name)
    private readonly topicModel: ReturnModelType<typeof Topic>,
  ) {}

  async search(
    tenantId: string,
    filters: SearchFilters,
  ): Promise<{ results: any[]; total: number }> {
    const query: Record<string, any> = { tenantId };

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
