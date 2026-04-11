import { CommandParser, ParsedCommand } from '../command/command-parser';
import { CommandRouter, CommandContext } from '../command/command-router';
import { TopicService } from '../services/topic.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { OpenClawBridge } from '../bridge/openclaw-bridge';
import type { OpenClawInboundResult } from '../bridge/openclaw-types';
import type { TopicHubLogger } from '../common/logger';
import { AnswerTextSchema } from '../identity/identity-types';
import { purifyImRelayText } from '../im/im-relay-text.js';

export interface WebhookIdentityOps {
  claimPairingCode(platform: string, platformUserId: string, code: string): Promise<{ topichubUserId: string }>;
  resolveUserByPlatform(platform: string, platformUserId: string): Promise<{ topichubUserId: string; claimToken: string } | undefined>;
  deactivateBinding(platform: string, platformUserId: string): Promise<boolean>;
  invalidateLeakedPairingCode(
    code: string,
    meta: { platform: string; channel: string },
  ): Promise<{ rotated: boolean }>;
}

export interface WebhookHeartbeatOps {
  isAvailable(topichubUserId: string): Promise<boolean>;
  /** True when a fresh heartbeat exists for this identity and its claimToken matches the IM binding (same serve session as /register). */
  isBoundExecutorSessionLive(
    topichubUserId: string,
    boundExecutorToken: string,
  ): Promise<boolean>;
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

  /** Route IM replies on the same OpenClaw session as the inbound message. */
  private sendThreadReply(result: OpenClawInboundResult, text: string) {
    return this.bridge!.sendMessage(result.platform, result.channel, text, {
      sessionKey: result.sessionId,
    });
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

    let cmd = result.rawCommand;

    // /help works without binding (FR-028) — also match 'help' without slash
    if (cmd === '/help' || cmd === 'help' || cmd.startsWith('/help ') || cmd.startsWith('help ')) {
      return this.handleHelp(result);
    }

    // /register <code> — DM only to protect pairing codes; group + valid code invalidates and rotates
    if (cmd.startsWith('/register ') || cmd === '/register') {
      const code = cmd.startsWith('/register ') ? cmd.slice('/register '.length).trim() : '';
      if (!result.isDm) {
        return this.handleRegisterInGroup(result, code);
      }
      return this.handleRegister(result, code);
    }

    // /answer — group only, requires binding (checked inside)
    if (cmd.startsWith('/answer ')) {
      if (result.isDm) {
        this.sendThreadReply(result, 'Please use `/answer` in the topic group chat.').catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'rejected_dm_not_allowed' } };
      }
      return this.handleAnswer(result, cmd.slice('/answer '.length));
    }

    // /unregister — DM only
    if (cmd.startsWith('/unregister') || cmd === '/unregister') {
      if (!result.isDm) {
        this.sendThreadReply(result, 'Please use `/unregister` in a direct message with the bot.').catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'rejected_not_dm' } };
      }
      return this.handleUnregister(result);
    }

    // All other commands require an active executor binding
    const identity = await this.identityOps?.resolveUserByPlatform(
      result.platform,
      result.userId,
    );

    if (!identity) {
      this.sendThreadReply(
        result,
        "You haven't linked a local executor yet. Run `/register <code>` to get started. Use `/help` to see all commands.",
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'unregistered' } };
    }

    const topichubUserId = identity.topichubUserId;

    const sessionLive = this.heartbeatOps
      ? await this.heartbeatOps.isBoundExecutorSessionLive(
          topichubUserId,
          identity.claimToken,
        )
      : false;
    if (sessionLive !== true) {
      this.sendThreadReply(
        result,
        'Your linked executor session is not active or is out of date. Start `topichub-admin serve`, then use `/register <code>` with the new pairing code from the terminal.',
      ).catch((err) => this.logger.error('Failed to send unavailable executor notice', String(err)));
      return { success: true, response: { status: 'executor_unavailable' } };
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
      relayText: purifyImRelayText(result.originalMessage),
      imChatLine: cmd,
      imCommandUsedSlash: cmd.trimStart().startsWith('/'),
      dispatchMeta: {
        targetUserId: topichubUserId,
        targetExecutorToken: identity.claimToken,
        sourceChannel: result.channel,
        sourcePlatform: result.platform,
      },
    };

    const parsed = this.parser.parse(cmd);

    if (result.isDm && parsed.action !== 'create') {
      this.sendThreadReply(
        result,
        'This command can only be used in a topic group chat. Use `/create` to start a new topic.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'rejected_dm_not_allowed' } };
    }

    const route = this.router.route(parsed, context);

    if (route.error) {
      this.sendThreadReply(result, route.error).catch((err) =>
        this.logger.error('Failed to send OpenClaw reply', String(err)),
      );
      return { success: false, error: route.error };
    }

    const dispatchContext: CommandContext =
      route.skillInvocationName != null
        ? { ...context, skillInvocationName: route.skillInvocationName }
        : context;

    const execResult = await this.commandDispatcher(route.handler, parsed, dispatchContext);

    const replyMessage = this.formatOpenClawCommandReply(execResult);

    this.sendThreadReply(result, replyMessage).catch((err) =>
      this.logger.error('Failed to send OpenClaw reply', String(err)),
    );

    return { success: true, response: execResult };
  }

  private formatOpenClawCommandReply(execResult: any): string {
    if (!execResult?.success) {
      return execResult?.error ?? 'Command failed';
    }
    const data = execResult.data;
    if (data?.commands && Array.isArray(data.commands)) {
      return [
        '📋 **Topic Hub**',
        '',
        '**Topic lifecycle**',
        '1. **Bind** — DM the bot: `/register <code>` (code from `topic-hub serve` on your machine). Keep serve running.',
        '2. **Open a topic** — In the group channel: `/create <type>` (optional `--title "…"`). Each group may have **one** non-`closed` topic at a time; set status to `closed` (or reopen an old one) before creating another.',
        '3. **Work** — Plain text in that group is relayed to your local executor while a topic is active. Use `/answer [#N] <text>` for agent Q&A; `/use <skill>` or `/SkillName …` to run a loaded skill.',
        '4. **Track** — `/show` current topic · `/timeline` events · `/history` past topics in this group.',
        '5. **Status** — `/update --status <s>` moves the topic. Valid values: `open`, `in_progress`, `resolved`, `closed` (only **allowed** transitions apply; the bot explains if a jump is invalid).',
        '6. **Handoff** — `/assign --user <id>` sets assignee (when permitted).',
        '7. **Done or restart** — `/update --status closed` (or `resolved` then `closed`) finishes the topic; `/reopen` revives a closed topic in this group when there is no other active topic (check `/history` if you have many).',
        '',
        '**DM only** (direct message with bot):',
        '`/register <code>` bind executor · `/unregister` unbind',
        '',
        '**Group only** (topic group chat):',
        '`/show` details · `/timeline` history · `/update --status <s>`',
        '`/assign --user <id>` · `/reopen` · `/history`',
        '`/search --type <t>` · `/use <skill>` invoke skill',
        '`/answer [#N] <text>` reply to agent',
        'Plain text (with an active topic) is sent to your local executor.',
        '`/RegisteredSkillName …` runs that skill via the local executor when the name matches a loaded skill.',
        '',
        '**DM + Group:**',
        '`/create <type>` new topic · `/help` this message',
      ].join('\n');
    }
    if (typeof execResult.message === 'string' && execResult.message.trim()) {
      return execResult.message.trim();
    }
    return 'Task dispatched to your local agent.';
  }

  private async handleHelp(result: OpenClawInboundResult): Promise<WebhookResult> {
    if (!this.bridge) {
      return { success: false, error: 'Bridge not configured' };
    }

    const helpExec = await this.commandDispatcher('help', { action: 'help', args: {} }, {
      platform: result.platform,
      groupId: result.channel,
      userId: result.userId,
      hasActiveTopic: false,
    });

    const replyMessage = this.formatOpenClawCommandReply(helpExec);
    this.sendThreadReply(result, replyMessage).catch((err) =>
      this.logger.error('Failed to send help reply', String(err)),
    );

    return { success: true, response: helpExec };
  }

  private async handleRegisterInGroup(
    result: OpenClawInboundResult,
    code: string,
  ): Promise<WebhookResult> {
    if (!this.bridge) {
      return { success: false, error: 'Bridge not configured' };
    }

    if (!code) {
      await this.sendThreadReply(
        result,
        'Please use `/register <code>` in a direct message with the bot. Pairing codes must not be posted in group chats.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'rejected_not_dm' } };
    }

    if (!this.identityOps) {
      await this.sendThreadReply(
        result,
        'Please use `/register` in a direct message with the bot to protect your pairing code.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'rejected_not_dm' } };
    }

    try {
      const { rotated } = await this.identityOps.invalidateLeakedPairingCode(code, {
        platform: result.platform,
        channel: result.channel,
      });

      if (rotated) {
        await this.sendThreadReply(
          result,
          [
            'That pairing code was exposed in a public channel and has been invalidated.',
            'A new code is shown in your `topichub-admin serve` terminal — copy it from there.',
            'Then send `/register <new-code>` in a direct message with this bot (never in a group).',
          ].join('\n'),
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'pairing_rotated_after_leak' } };
      }

      await this.sendThreadReply(
        result,
        'Do not post pairing codes in group chats. Use `/register <code>` in a direct message with the bot only.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'rejected_not_dm' } };
    } catch (err) {
      this.logger.error('Group register leak handling failed', String(err));
      await this.sendThreadReply(
        result,
        'Do not post pairing codes in group chats. Use `/register <code>` in a direct message with the bot only.',
      ).catch((e) => this.logger.error('Failed to send OpenClaw reply', String(e)));
      return { success: false, error: 'Failed to process group register' };
    }
  }

  private async handleRegister(result: OpenClawInboundResult, code: string): Promise<WebhookResult> {
    if (!this.identityOps || !this.bridge) {
      return { success: false, error: 'Identity operations not configured' };
    }

    if (!code) {
      await this.sendThreadReply(
        result,
        'Usage: `/register <pairing-code>`\nGet a code from your local executor: `topichub-admin serve`',
      );
      return { success: false, error: 'No pairing code provided' };
    }

    try {
      const claimed = await this.identityOps.claimPairingCode(
        result.platform,
        result.userId,
        code,
      );

      await this.sendThreadReply(result, 'Registered! Your commands will be routed to your local executor.');

      return { success: true, response: { status: 'registered', topichubUserId: claimed.topichubUserId } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Register command failed', msg);
      await this.sendThreadReply(
        result,
        'Invalid or expired pairing code. Get a fresh code from your local executor (`topichub-admin serve`).',
      );
      return { success: false, error: 'Failed to claim pairing code' };
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
        await this.sendThreadReply(result, 'No linked executor found. Use `/register <code>` to link first.');
        return { success: true, response: { status: 'not_found' } };
      }

      await this.identityOps.deactivateBinding(result.platform, result.userId);

      await this.sendThreadReply(result, 'Your executor has been unlinked. Use `/register <code>` to re-link.');

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
        await this.sendThreadReply(result, 'You need to register first.');
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
        await this.sendThreadReply(result, 'No pending questions to answer.');
        return { success: true, response: { status: 'no_pending' } };
      }

      const answerParsed = AnswerTextSchema.safeParse(answerText.trim());
      if (!answerParsed.success) {
        await this.sendThreadReply(result, 'Answer is empty or too long (max 5000 characters).');
        return { success: true, response: { status: 'invalid_answer' } };
      }

      await this.qaOps.submitAnswer(String(targetQa._id), answerParsed.data);

      await this.sendThreadReply(result, 'Answer received. Your agent will continue.');

      return { success: true, response: { status: 'answered' } };
    } catch (err) {
      this.logger.error('Answer command failed', String(err));
      return { success: false, error: 'Failed to process answer' };
    }
  }

}
