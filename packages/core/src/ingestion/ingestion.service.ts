import { TopicService } from '../services/topic.service';
import { TimelineService } from '../services/timeline.service';
import { SkillRegistry } from '../skill/registry/skill-registry';
import { SkillPipeline } from '../skill/pipeline/skill-pipeline';
import { TopicStatus, TimelineActionType } from '../common/enums';
import { ValidationError } from '../common/errors';
import { EventPayload } from './event-payload';
import type { TopicHubLogger } from '../common/logger';

const ACTOR = 'system:ingestion';

export class IngestionService {
  constructor(
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillPipeline: SkillPipeline,
    private readonly logger: TopicHubLogger,
  ) {}

  async ingest(
    payload: EventPayload,
  ): Promise<{ topic: any; created: boolean }> {
    const isAvailable = await this.skillRegistry.isTypeAvailable(
      payload.type,
    );
    if (!isAvailable) {
      throw new ValidationError(
        `Topic type "${payload.type}" is not registered or enabled for this tenant`,
      );
    }

    const typeSkill = this.skillRegistry.getTypeSkillForType(payload.type);
    if (!typeSkill) {
      throw new ValidationError(
        `No skill registered for topic type "${payload.type}"`,
      );
    }

    const validation = typeSkill.validateMetadata(payload.metadata);
    if (!validation.valid) {
      throw new ValidationError(
        `Metadata validation failed: ${validation.errors?.map((e) => `${e.field}: ${e.message}`).join('; ') ?? 'unknown error'}`,
      );
    }

    if (payload.sourceUrl) {
      const existing = await this.topicService.findBySourceUrl(
        payload.sourceUrl,
      );

      if (existing) {
        if (payload.status && payload.status !== existing.status) {
          await this.topicService.updateStatus(
            existing._id.toString(),
            payload.status as TopicStatus,
            ACTOR,
          );
        }

        await this.timelineService.append(
          existing._id,
          ACTOR,
          TimelineActionType.METADATA_UPDATED,
          { source: 'ingestion-api', title: payload.title },
        );

        await this.skillPipeline.execute(
          'updated',
          existing,
          ACTOR,
        );

        return { topic: existing, created: false };
      }
    }

    const topic = await this.topicService.create({
      type: payload.type,
      title: payload.title,
      sourceUrl: payload.sourceUrl,
      metadata: payload.metadata,
      createdBy: ACTOR,
    });

    for (const tag of payload.tags) {
      await this.topicService.addTag(
        topic._id.toString(),
        tag,
        ACTOR,
      );
    }

    for (const userId of payload.assignees) {
      await this.topicService.assignUser(
        topic._id.toString(),
        userId,
        ACTOR,
      );
    }

    await this.skillPipeline.execute('created', topic, ACTOR);

    return { topic, created: true };
  }
}
