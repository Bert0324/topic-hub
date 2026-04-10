import { SkillRegistry } from '../skill/registry/skill-registry';
import { CommandParser, ParsedCommand } from '../command/command-parser';
import { CommandRouter, CommandContext } from '../command/command-router';
import { TopicService } from '../services/topic.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { SkillCategory } from '../common/enums';
import { AdapterSkill } from '../skill/interfaces/adapter-skill';
import { OpenClawBridge } from '../bridge/openclaw-bridge';
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
    private readonly bridge?: OpenClawBridge,
  ) {}

  async handle(
    platform: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const adapterMatch = this.findAdapterSkill(platform);
    if (adapterMatch) {
      return this.handleAdapterWebhook(adapterMatch.skill, adapterMatch.name, payload, headers);
    }

    return { success: false, error: `No skill registered for platform: ${platform}` };
  }

  async handleOpenClaw(payload: unknown, rawBody: string): Promise<WebhookResult> {
    if (!this.bridge) {
      return { success: false, error: 'OpenClaw bridge not configured' };
    }

    const result = this.bridge.handleInboundWebhook(payload, rawBody);
    if (!result) {
      return { success: true, response: { status: 'ignored' } };
    }

    const activeTopic = await this.topicService.findActiveTopicByGroup(
      result.tenantId,
      result.platform,
      result.channel,
    );

    const context: CommandContext = {
      platform: result.platform,
      groupId: result.channel,
      userId: result.userId,
      tenantId: result.tenantId,
      hasActiveTopic: !!activeTopic,
    };

    const parsed = this.parser.parse(result.rawCommand);
    const route = this.router.route(parsed, context);

    if (route.error) {
      return { success: false, error: route.error };
    }

    const execResult = await this.commandDispatcher(route.handler, result.tenantId, parsed, context);

    this.bridge
      .sendMessage(result.platform, result.channel, execResult?.success ? 'Command executed successfully.' : (execResult?.error ?? 'Command failed'))
      .catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));

    return { success: true, response: execResult };
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

  private findAdapterSkill(skillName: string): { skill: AdapterSkill; name: string } | undefined {
    const adapters = this.skillRegistry.getByCategory(SkillCategory.ADAPTER);
    const match = adapters.find((a) => a.registration.name === skillName);
    if (!match) return undefined;
    return { skill: match.skill as AdapterSkill, name: match.registration.name };
  }

}
