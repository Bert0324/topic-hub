import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TopicService } from '../core/services/topic.service';
import { TimelineService } from '../core/services/timeline.service';
import { SkillRegistry } from '../skill/registry/skill-registry';
import { SkillPipeline } from '../skill/pipeline/skill-pipeline';
import { TopicStatus, TimelineActionType } from '../common/enums';
import { EventPayload } from './dto/event-payload.dto';

const ACTOR = 'system:ingestion';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillPipeline: SkillPipeline,
  ) {}

  async ingest(
    tenantId: string,
    payload: EventPayload,
  ): Promise<{ topic: any; created: boolean }> {
    const isAvailable = await this.skillRegistry.isTypeAvailable(
      payload.type,
      tenantId,
    );
    if (!isAvailable) {
      throw new BadRequestException(
        `Topic type "${payload.type}" is not registered or enabled for this tenant`,
      );
    }

    const typeSkill = this.skillRegistry.getTypeSkillForType(payload.type);
    if (!typeSkill) {
      throw new BadRequestException(
        `No skill registered for topic type "${payload.type}"`,
      );
    }

    const validation = typeSkill.validateMetadata(payload.metadata);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Metadata validation failed',
        errors: validation.errors,
      });
    }

    if (payload.sourceUrl) {
      const existing = await this.topicService.findBySourceUrl(
        tenantId,
        payload.sourceUrl,
      );

      if (existing) {
        if (payload.status && payload.status !== existing.status) {
          await this.topicService.updateStatus(
            tenantId,
            existing._id.toString(),
            payload.status as TopicStatus,
            ACTOR,
          );
        }

        await this.timelineService.append(
          tenantId,
          existing._id,
          ACTOR,
          TimelineActionType.METADATA_UPDATED,
          { source: 'ingestion-api', title: payload.title },
        );

        await this.skillPipeline.execute(
          tenantId,
          'updated',
          existing,
          ACTOR,
        );

        return { topic: existing, created: false };
      }
    }

    const topic = await this.topicService.create(tenantId, {
      type: payload.type,
      title: payload.title,
      sourceUrl: payload.sourceUrl,
      metadata: payload.metadata,
      createdBy: ACTOR,
    });

    for (const tag of payload.tags) {
      await this.topicService.addTag(
        tenantId,
        topic._id.toString(),
        tag,
        ACTOR,
      );
    }

    for (const userId of payload.assignees) {
      await this.topicService.assignUser(
        tenantId,
        topic._id.toString(),
        userId,
        ACTOR,
      );
    }

    await this.skillPipeline.execute(tenantId, 'created', topic, ACTOR);

    return { topic, created: true };
  }
}
