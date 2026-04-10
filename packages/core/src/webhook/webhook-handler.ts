import { SkillRegistry } from '../skill/registry/skill-registry';
import { CommandParser, ParsedCommand } from '../command/command-parser';
import { CommandRouter, CommandContext } from '../command/command-router';
import { TopicService } from '../services/topic.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { SkillCategory } from '../common/enums';
import { PlatformSkill, CommandResult } from '../skill/interfaces/platform-skill';
import { AdapterSkill } from '../skill/interfaces/adapter-skill';
import type { TopicHubLogger } from '../common/logger';

export interface WebhookResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

export type CommandDispatcher = (
  handler: string,
  tenantId: string,
  parsed: ParsedCommand,
  context: CommandContext,
) => Promise<any>;

export class WebhookHandler {
  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly parser: CommandParser,
    private readonly router: CommandRouter,
    private readonly topicService: TopicService,
    private readonly ingestionService: IngestionService,
    private readonly commandDispatcher: CommandDispatcher,
    private readonly logger: TopicHubLogger,
  ) {}

  async handle(
    platform: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const platformSkill = this.findPlatformSkill(platform);
    if (platformSkill) {
      return this.handlePlatformWebhook(platformSkill, platform, payload, headers);
    }

    const adapterMatch = this.findAdapterSkill(platform);
    if (adapterMatch) {
      return this.handleAdapterWebhook(adapterMatch.skill, adapterMatch.name, payload, headers);
    }

    return { success: false, error: `No skill registered for platform: ${platform}` };
  }

  private async handlePlatformWebhook(
    platformSkill: PlatformSkill,
    platform: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    if (typeof platformSkill.verifySignature === 'function') {
      const valid = await platformSkill.verifySignature(payload, headers);
      if (!valid) {
        return { success: false, error: 'Webhook signature verification failed' };
      }
    }

    if (!platformSkill.resolveTenantId) {
      this.logger.warn(`Platform skill ${platform} does not support resolveTenantId`);
      return { success: false, error: 'Platform skill cannot resolve tenant' };
    }

    const tenantId = await platformSkill.resolveTenantId(payload);

    if (!platformSkill.handleWebhook) {
      this.logger.debug(`Platform skill ${platform} does not handle webhooks`);
      return { success: true, response: { message: 'Webhook received, no handler configured' } };
    }

    const commandResult = await platformSkill.handleWebhook(payload, headers);
    if (!commandResult) {
      return { success: true, response: { message: 'Webhook event ignored' } };
    }

    const rawCommand = this.buildRawCommand(commandResult);
    const activeTopic = await this.topicService.findActiveTopicByGroup(
      tenantId,
      commandResult.platform,
      commandResult.groupId,
    );

    const context: CommandContext = {
      platform: commandResult.platform,
      groupId: commandResult.groupId,
      userId: commandResult.userId,
      tenantId,
      hasActiveTopic: !!activeTopic,
    };

    const parsed = this.parser.parse(rawCommand);
    const route = this.router.route(parsed, context);

    if (route.error) {
      return { success: false, error: route.error };
    }

    const result = await this.commandDispatcher(route.handler, tenantId, parsed, context);
    return { success: true, response: result };
  }

  private async handleAdapterWebhook(
    adapterSkill: AdapterSkill,
    skillName: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    try {
      let tenantId: string | undefined;
      if (
        'resolveTenantId' in adapterSkill &&
        typeof (adapterSkill as any).resolveTenantId === 'function'
      ) {
        tenantId = await (adapterSkill as any).resolveTenantId(payload, headers);
      }
      if (!tenantId) {
        tenantId = headers['x-tenant-id'];
      }

      if (!tenantId) {
        this.logger.warn(
          `No tenant ID resolved for webhook on adapter "${skillName}"`,
        );
        return { success: false, error: 'No tenant ID resolved' };
      }

      const eventPayload = adapterSkill.transformWebhook(payload, headers);
      if (!eventPayload) {
        this.logger.debug(
          `Adapter "${skillName}" returned null — event filtered out`,
        );
        return { success: true, response: { status: 'ignored', reason: 'filtered by adapter' } };
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
        success: true,
        response: {
          status: 'accepted',
          created: result.created,
          topicId: result.topic._id,
        },
      };
    } catch (err) {
      this.logger.error(
        `Webhook processing failed for adapter "${skillName}"`,
        String(err),
      );
      return { success: false, error: 'Internal processing failure' };
    }
  }

  private findPlatformSkill(platform: string): PlatformSkill | undefined {
    const platformSkills = this.skillRegistry.getByCategory(SkillCategory.PLATFORM);
    const found = platformSkills.find(
      (s) => (s.registration.metadata as any)?.platform === platform,
    );
    return found?.skill as PlatformSkill | undefined;
  }

  private findAdapterSkill(skillName: string): { skill: AdapterSkill; name: string } | undefined {
    const adapters = this.skillRegistry.getByCategory(SkillCategory.ADAPTER);
    const match = adapters.find((a) => a.registration.name === skillName);
    if (!match) return undefined;
    return { skill: match.skill as AdapterSkill, name: match.registration.name };
  }

  private buildRawCommand(result: CommandResult): string {
    const parts = ['/topichub', result.action];

    if (result.type) {
      parts.push(result.type);
    }

    for (const [key, value] of Object.entries(result.args)) {
      if (value === true) {
        parts.push(`--${key}`);
      } else if (value !== undefined && value !== null) {
        const strVal = String(value);
        parts.push(`--${key}`, strVal.includes(' ') ? `"${strVal}"` : strVal);
      }
    }

    return parts.join(' ');
  }
}
