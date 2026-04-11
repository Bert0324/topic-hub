import { SkillRegistry } from '../skill/registry/skill-registry';
import { CommandParser, ParsedCommand } from '../command/command-parser';
import { CommandRouter, CommandContext } from '../command/command-router';
import { TopicService } from '../services/topic.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { SkillCategory } from '../common/enums';
import { AdapterSkill } from '../skill/interfaces/adapter-skill';
import { OpenClawBridge } from '../bridge/openclaw-bridge';
import type { OpenClawInboundResult } from '../bridge/openclaw-types';
import type { TopicHubLogger } from '../common/logger';
import { AnswerTextSchema } from '../identity/identity-types';

export interface WebhookIdentityOps {
  generatePairingCode(platform: string, platformUserId: string, channel: string): Promise<string>;
  resolveUserByPlatform(platform: string, platformUserId: string): Promise<{ topichubUserId: string; claimToken: string } | undefined>;
  deactivateBinding(platform: string, platformUserId: string): Promise<boolean>;
}

export interface WebhookHeartbeatOps {
  isAvailable(topichubUserId: string): Promise<boolean>;
}

export interface WebhookQaOps {
  findPendingByUser(topichubUserId: string): Promise<any | null>;
  findAllPendingByUser(topichubUserId: string): Promise<any[]>;
  submitAnswer(qaId: string, answerText: string): Promise<any | null>;
}

export interface WebhookResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

export type CommandDispatcher = (
  handler: string,
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
    private readonly identityOps?: WebhookIdentityOps,
    private readonly heartbeatOps?: WebhookHeartbeatOps,
    private readonly qaOps?: WebhookQaOps,
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

  async handleOpenClaw(
    payload: unknown,
    rawBody?: Buffer | string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookResult> {
    if (!this.bridge) {
      return { success: false, error: 'OpenClaw bridge not configured' };
    }

    const result = this.bridge.handleInboundWebhook(payload, rawBody, headers);
    if (!result) {
      return { success: true, response: { status: 'ignored' } };
    }

    if (result.rawCommand.startsWith('/answer ')) {
      return this.handleAnswer(result, result.rawCommand.slice('/answer '.length));
    }

    if (result.rawCommand.startsWith('/topichub register')) {
      return this.handleRegister(result);
    }

    if (result.rawCommand.startsWith('/topichub unregister')) {
      return this.handleUnregister(result);
    }

    const identity = await this.identityOps?.resolveUserByPlatform(
      result.platform,
      result.userId,
    );

    if (!identity) {
      this.bridge
        .sendMessage(result.platform, result.channel, "You haven't linked a local executor yet. Run `/topichub register` to get started.")
        .catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'unregistered' } };
    }

    const topichubUserId = identity.topichubUserId;

    const available = await this.heartbeatOps?.isAvailable(topichubUserId);
    if (available === false) {
      this.bridge
        .sendMessage(
          result.platform,
          result.channel,
          'Your local agent is not running. Start it with: `topichub-admin serve`\nYour task has been queued and will be processed when your agent starts.',
        )
        .catch((err) => this.logger.error('Failed to send unavailable executor notice', String(err)));
    }

    const activeTopic = await this.topicService.findActiveTopicByGroup(
      result.platform,
      result.channel,
    );

    const context: CommandContext = {
      platform: result.platform,
      groupId: result.channel,
      userId: result.userId,
      hasActiveTopic: !!activeTopic,
      dispatchMeta: {
        targetUserId: topichubUserId,
        sourceChannel: result.channel,
        sourcePlatform: result.platform,
      },
    };

    const parsed = this.parser.parse(result.rawCommand);
    const route = this.router.route(parsed, context);

    if (route.error) {
      this.bridge
        .sendMessage(result.platform, result.channel, route.error)
        .catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: false, error: route.error };
    }

    const execResult = await this.commandDispatcher(route.handler, parsed, context);

    const replyMessage = this.formatOpenClawCommandReply(execResult);

    this.bridge
      .sendMessage(result.platform, result.channel, replyMessage)
      .catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));

    return { success: true, response: execResult };
  }

  /** IM-friendly text: help lists commands/types; other successes keep a short default. */
  private formatOpenClawCommandReply(execResult: any): string {
    if (!execResult?.success) {
      return execResult?.error ?? 'Command failed';
    }
    const data = execResult.data;
    if (data?.commands && Array.isArray(data.commands)) {
      const cmdLines = data.commands
        .map(
          (c: { command: string; description: string }) =>
            `• \`${c.command}\` — ${c.description}`,
        )
        .join('\n');
      const typeLines =
        Array.isArray(data.types) && data.types.length > 0
          ? data.types
              .map(
                (t: { type: string; description: string }) =>
                  `• \`${t.type}\` — ${t.description}`,
              )
              .join('\n')
          : '• _(none registered)_';
      return `**Topic Hub** — prefix \`/topichub\`\n\n**Commands**\n${cmdLines}\n\n**Topic types**\n${typeLines}`;
    }
    if (typeof execResult.message === 'string' && execResult.message.trim()) {
      return execResult.message.trim();
    }
    return 'Task dispatched to your local agent.';
  }

  private async handleRegister(result: OpenClawInboundResult): Promise<WebhookResult> {
    if (!this.identityOps || !this.bridge) {
      return { success: false, error: 'Identity operations not configured' };
    }

    try {
      const code = await this.identityOps.generatePairingCode(
        result.platform,
        result.userId,
        result.channel,
      );

      const message = `Your pairing code: **${code}**\nEnter this in your terminal: \`topichub-admin link ${code}\`\nCode expires in 10 minutes.`;

      await this.bridge.sendMessage(result.platform, result.channel, message);

      return { success: true, response: { status: 'registered' } };
    } catch (err) {
      this.logger.error('Register command failed', String(err));
      return { success: false, error: 'Failed to generate pairing code' };
    }
  }

  private async handleUnregister(result: OpenClawInboundResult): Promise<WebhookResult> {
    if (!this.identityOps || !this.bridge) {
      return { success: false, error: 'Identity operations not configured' };
    }

    try {
      const resolved = await this.identityOps.resolveUserByPlatform(
        result.platform,
        result.userId,
      );

      if (!resolved) {
        await this.bridge.sendMessage(
          result.platform,
          result.channel,
          'No linked identity found. Use `/topichub register` to link first.',
        );
        return { success: true, response: { status: 'not_found' } };
      }

      await this.identityOps.deactivateBinding(result.platform, result.userId);

      await this.bridge.sendMessage(
        result.platform,
        result.channel,
        'Your identity has been unlinked. Use `/topichub register` to re-link.',
      );

      return { success: true, response: { status: 'unregistered' } };
    } catch (err) {
      this.logger.error('Unregister command failed', String(err));
      return { success: false, error: 'Failed to unregister identity' };
    }
  }

  private async handleAnswer(result: OpenClawInboundResult, answerBody: string): Promise<WebhookResult> {
    if (!this.identityOps || !this.bridge || !this.qaOps) {
      return { success: false, error: 'Q&A operations not configured' };
    }

    try {
      const identity = await this.identityOps.resolveUserByPlatform(
        result.platform,
        result.userId,
      );

      if (!identity) {
        await this.bridge.sendMessage(result.platform, result.channel, 'You need to register first.');
        return { success: true, response: { status: 'unregistered' } };
      }

      let answerText = answerBody;
      let targetQa: any = null;

      const refMatch = answerBody.match(/^#(\d+)\s+([\s\S]*)$/);
      if (refMatch) {
        const refIndex = parseInt(refMatch[1], 10);
        answerText = refMatch[2];
        const allPending = await this.qaOps.findAllPendingByUser(identity.topichubUserId);
        if (refIndex >= 1 && refIndex <= allPending.length) {
          targetQa = allPending[refIndex - 1];
        } else {
          targetQa = allPending.length > 0 ? allPending[allPending.length - 1] : null;
        }
      } else {
        targetQa = await this.qaOps.findPendingByUser(identity.topichubUserId);
      }

      if (!targetQa) {
        await this.bridge.sendMessage(result.platform, result.channel, 'No pending questions to answer.');
        return { success: true, response: { status: 'no_pending' } };
      }

      const answerParsed = AnswerTextSchema.safeParse(answerText.trim());
      if (!answerParsed.success) {
        await this.bridge.sendMessage(
          result.platform,
          result.channel,
          'Answer is empty or too long (max 5000 characters).',
        );
        return { success: true, response: { status: 'invalid_answer' } };
      }

      await this.qaOps.submitAnswer(String(targetQa._id), answerParsed.data);

      await this.bridge.sendMessage(result.platform, result.channel, 'Answer received. Your agent will continue.');

      return { success: true, response: { status: 'answered' } };
    } catch (err) {
      this.logger.error('Answer command failed', String(err));
      return { success: false, error: 'Failed to process answer' };
    }
  }

  private async handleAdapterWebhook(
    adapterSkill: AdapterSkill,
    skillName: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    try {
      const eventPayload = adapterSkill.transformWebhook(payload, headers);
      if (!eventPayload) {
        this.logger.debug(
          `Adapter "${skillName}" returned null — event filtered out`,
        );
        return { success: true, response: { status: 'ignored', reason: 'filtered by adapter' } };
      }

      const result = await this.ingestionService.ingest({
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
