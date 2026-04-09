import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkillRegistry } from '../skill/registry/skill-registry';
import { SkillCategory } from '../common/enums';
import { AdapterSkill } from '../skill/interfaces/adapter-skill';
import { IngestionService } from './ingestion.service';

@Controller('webhooks/adapter')
export class AdapterWebhookController {
  private readonly logger = new Logger(AdapterWebhookController.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly ingestionService: IngestionService,
  ) {}

  @Post(':skillName')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('skillName') skillName: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      const adapters = this.skillRegistry.getByCategory(SkillCategory.ADAPTER);
      const match = adapters.find((a) => a.registration.name === skillName);

      if (!match) {
        this.logger.warn(`Adapter skill "${skillName}" not found`);
        return { status: 'ignored', reason: 'unknown adapter' };
      }

      const adapterSkill = match.skill as AdapterSkill;

      let tenantId: string | undefined;
      if (
        'resolveTenantId' in adapterSkill &&
        typeof (adapterSkill as any).resolveTenantId === 'function'
      ) {
        tenantId = await (adapterSkill as any).resolveTenantId(body, headers);
      }
      if (!tenantId) {
        tenantId = headers['x-tenant-id'];
      }

      if (!tenantId) {
        this.logger.warn(
          `No tenant ID resolved for webhook on adapter "${skillName}"`,
        );
        return { status: 'ignored', reason: 'no tenant id' };
      }

      const eventPayload = adapterSkill.transformWebhook(body, headers);
      if (!eventPayload) {
        this.logger.debug(
          `Adapter "${skillName}" returned null — event filtered out`,
        );
        return { status: 'ignored', reason: 'filtered by adapter' };
      }

      const result = await this.ingestionService.ingest(tenantId, {
        type: eventPayload.type,
        title: eventPayload.title,
        sourceUrl: eventPayload.sourceUrl,
        status: eventPayload.status,
        metadata: eventPayload.metadata ?? {},
        tags: eventPayload.tags ?? [],
        assignees: eventPayload.assignees ?? [],
      });

      return {
        status: 'accepted',
        created: result.created,
        topicId: result.topic._id,
      };
    } catch (err) {
      this.logger.error(
        `Webhook processing failed for adapter "${skillName}"`,
        err,
      );
      return { status: 'error', reason: 'internal processing failure' };
    }
  }
}
