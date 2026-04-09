import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../tenant/tenant.guard';
import { TopicService } from './services/topic.service';
import { TimelineService } from './services/timeline.service';

@Controller('api/v1/topics')
@UseGuards(TenantGuard)
export class TopicDetailController {
  constructor(
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
  ) {}

  @Get(':id')
  async getTopicDetail(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as unknown as Record<string, unknown>)[
      'tenantId'
    ] as string;

    const topic = await this.topicService.findById(tenantId, id);
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  @Get(':id/timeline')
  async getTimeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const tenantId = (req as unknown as Record<string, unknown>)[
      'tenantId'
    ] as string;

    return this.timelineService.findByTopic(
      tenantId,
      id,
      parseInt(page ?? '1', 10),
      parseInt(pageSize ?? '50', 10),
    );
  }
}
