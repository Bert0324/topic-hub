import { CommandParser, ParsedCommand } from '../command/command-parser';
import { CommandRouter, CommandContext } from '../command/command-router';
import type { PublishedSkillCatalog } from '../services/published-skill-catalog';
import { TopicService } from '../services/topic.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { OpenClawBridge } from '../bridge/openclaw-bridge';
import type { OpenClawInboundResult } from '../bridge/openclaw-types';
import type { TopicHubLogger } from '../common/logger';
import { purifyImRelayText } from '../im/im-relay-text.js';
import { stripOptionalImAgentTargetPrefix } from '../im/im-agent-target-prefix.js';
import { ConflictError } from '../common/errors';
import type { ImSelfServeIdentitySnapshot } from '../services/im-self-serve-identity.service';

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

/** IM `/id create` and `/id me` (see specs/017-im-first-identification). */
export interface WebhookImSelfServeOps {
  createFromIm(params: {
    platform: string;
    platformUserId: string;
    displayName: string;
  }): Promise<ImSelfServeIdentitySnapshot>;
  getMeForIm(params: { platform: string; platformUserId: string }): Promise<ImSelfServeIdentitySnapshot | null>;
  getByIdentityId(identityId: string): Promise<ImSelfServeIdentitySnapshot | null>;
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
    private readonly imSelfServeOps?: WebhookImSelfServeOps,
    private readonly publishedSkillCatalog?: PublishedSkillCatalog,
  ) { }

  /**
   * Route IM replies on the same OpenClaw session as the inbound message.
   * Always pass `sessionKey` so thread/DM routing cannot drift from the triggering envelope.
   */
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
    let imTargetAgentSlot: number | undefined;
    {
      const ap = stripOptionalImAgentTargetPrefix(cmd);
      if (ap.imTargetAgentSlot != null) {
        imTargetAgentSlot = ap.imTargetAgentSlot;
        cmd = ap.line;
      }
    }

    // /help works without binding (FR-028) — also match 'help' without slash
    if (cmd === '/help' || cmd === 'help' || cmd.startsWith('/help ') || cmd.startsWith('help ')) {
      return this.handleHelp(result);
    }

    // /id create | /id me — DM only (tokens); before generic identity gate (contracts/im-identity-routing.md)
    if (cmd === '/id' || cmd.startsWith('/id ')) {
      return this.handleImIdCommands(result, cmd);
    }

    // /register <code> — DM only to protect pairing codes; group + valid code invalidates and rotates
    if (cmd.startsWith('/register ') || cmd === '/register') {
      const code = this.extractPairingCodeFromRegisterCommand(cmd);
      if (!result.isDm) {
        return this.handleRegisterInGroup(result, code);
      }
      return this.handleRegister(result, code);
    }

    if (result.isDm && /^\s*\/(?:answer|queue)\b/i.test(cmd.trim())) {
      this.sendThreadReply(
        result,
        'Hub does not handle `/answer` or `/queue`. In the **topic group**, use `/agent #M <line>` with the **agent #M** from the executor claim line (or plain text / `/SkillName` for the default slot).',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'rejected_dm_not_allowed' } };
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

    // /skills — DM only. List is public (no pairing). Star needs identity (+ live serve below).
    const cmdTrimSkills = cmd.trim();
    if (/^\s*\/skills\b/i.test(cmdTrimSkills)) {
      if (!result.isDm) {
        this.sendThreadReply(
          result,
          '`/skills list` and `/skills star` only work in a **direct message** with the bot. Open a DM with the bot and try again.',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'skills_dm_only' } };
      }
      const parsedSkills = this.parser.parse(cmdTrimSkills);
      if (parsedSkills.action === 'skills') {
        const skSub = parsedSkills.type?.toLowerCase();
        if (skSub === 'list') {
          if (this.publishedSkillCatalog) {
            await this.publishedSkillCatalog.refreshIfNeeded();
          }
          const listCtx: CommandContext = {
            platform: result.platform,
            groupId: result.channel,
            userId: result.userId,
            hasActiveTopic: false,
            imChatLine: cmdTrimSkills,
            imCommandUsedSlash: cmdTrimSkills.startsWith('/'),
          };
          const listExec = await this.commandDispatcher('skills', parsedSkills, listCtx);
          const listMsg = this.formatOpenClawCommandReply(listExec);
          if (listMsg.trim()) {
            this.sendThreadReply(result, listMsg).catch((err) =>
              this.logger.error('Failed to send OpenClaw reply', String(err)),
            );
          }
          return { success: true, response: listExec };
        }
        if (skSub === 'star') {
          const boundForStar = await this.identityOps?.resolveUserByPlatform(
            result.platform,
            result.userId,
          );
          if (!boundForStar) {
            this.sendThreadReply(
              result,
              '`/skills star` needs a linked identity. Run `/register <code>` in this DM first (pairing code from `topichub-admin serve`).',
            ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
            return { success: true, response: { status: 'skills_star_unregistered' } };
          }
          // Fall through: enforce heartbeat and run star via normal command path.
        } else {
          const routeSkills = this.router.route(parsedSkills, {
            platform: result.platform,
            groupId: result.channel,
            userId: result.userId,
            hasActiveTopic: false,
            imChatLine: cmdTrimSkills,
            imCommandUsedSlash: cmdTrimSkills.startsWith('/'),
          });
          if (routeSkills.error) {
            this.sendThreadReply(result, routeSkills.error).catch((err) =>
              this.logger.error('Failed to send OpenClaw reply', String(err)),
            );
            return { success: true, response: { status: 'skills_usage' } };
          }
        }
      }
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
        'Your linked executor session is not active or is out of date. Start `topichub-admin serve`, then DM `/register <code>` using the pairing code shown in the terminal.',
      ).catch((err) => this.logger.error('Failed to send unavailable executor notice', String(err)));
      return { success: true, response: { status: 'executor_unavailable' } };
    }

    if (result.isDm && /^\s*\/agent\b/i.test(cmd.trim())) {
      this.sendThreadReply(
        result,
        '`/agent` runs in a **topic group** with an active topic. Open your team topic chat, then try `/agent list` or `/agent create`.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'agent_dm_only' } };
    }

    const activeTopic = await this.topicService.findActiveTopicByGroup(
      result.platform,
      result.channel,
    );

    const workingCmd = cmd;

    const context: CommandContext = {
      platform: result.platform,
      groupId: result.channel,
      userId: result.userId,
      hasActiveTopic: !!activeTopic,
      relayText: purifyImRelayText(result.originalMessage),
      imChatLine: workingCmd,
      imCommandUsedSlash: workingCmd.trimStart().startsWith('/'),
      dispatchMeta: {
        targetUserId: topichubUserId,
        targetExecutorToken: identity.claimToken,
        sourceChannel: result.channel,
        sourcePlatform: result.platform,
      },
      ...(imTargetAgentSlot != null ? { imTargetAgentSlot } : {}),
    };

    const trimmedCmdForAgent = cmd.trim();
    const trimmedWorkingForAgent = workingCmd.trim();
    const agentLineForDispatch =
      /^\s*\/agent\b/i.test(trimmedCmdForAgent)
        ? trimmedCmdForAgent
        : /^\s*\/agent\b/i.test(trimmedWorkingForAgent)
          ? trimmedWorkingForAgent
          : '';
    if (!result.isDm && agentLineForDispatch) {
      if (!activeTopic) {
        this.sendThreadReply(
          result,
          'No active topic in this group. Create one first with `/create <type>`, then use `/agent`.',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'agent_no_topic' } };
      }
      const parsedAgent = this.parser.parse(agentLineForDispatch);
      const agentCtx: CommandContext = {
        ...context,
        imChatLine: agentLineForDispatch,
        imCommandUsedSlash: true,
      };
      const execAgent = await this.commandDispatcher('agent', parsedAgent, agentCtx);
      const agentMsg = this.formatOpenClawCommandReply(execAgent);
      if (agentMsg.trim()) {
        this.sendThreadReply(result, agentMsg).catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
      } else if (execAgent?.success && execAgent?.deferOpenClawThreadReply) {
        this.sendThreadReply(
          result,
          'Forwarded to your linked **`serve`** session — watch for **Task completed** with the roster (and a short “running this task” line when the executor claims it).',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      }
      return { success: true, response: execAgent };
    }

    const parsed = this.parser.parse(workingCmd);

    if (!result.isDm && parsed.action === 'skills') {
      this.sendThreadReply(
        result,
        '`/skills list` and `/skills star` only work in a **direct message** with the bot. Open a DM with the bot and try again.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'skills_dm_only' } };
    }

    if (this.publishedSkillCatalog) {
      await this.publishedSkillCatalog.refreshIfNeeded();
    }

    /** `/skills list` may be satisfied earlier without binding; DM also allows `list`/`star` here. */
    const skillsCommandsInDm = parsed.action === 'skills';
    if (result.isDm) {
      if (parsed.action === 'create') {
        this.sendThreadReply(
          result,
          '`/create` only runs in a **server or group channel**, not in DM. Add the bot to a server, open a text channel, then run `/create <type>` there. In DM: `/id create`, `/register`, `/skills`, `/help`.',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'rejected_create_dm' } };
      }
      if (!skillsCommandsInDm) {
        this.sendThreadReply(
          result,
          'This command only works in a **server or group channel**. Invite the bot to a channel, then run `/create <type>` to start a topic.',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'rejected_dm_not_allowed' } };
      }
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
        : route.publishedSkillMissToken != null
          ? {
            ...context,
            publishedSkillRouting: {
              status: 'miss',
              token: route.publishedSkillMissToken,
            },
          }
          : context;

    const execResult = await this.commandDispatcher(route.handler, parsed, dispatchContext);

    const replyMessage = this.formatOpenClawCommandReply(execResult);

    if (replyMessage.trim()) {
      this.sendThreadReply(result, replyMessage).catch((err) =>
        this.logger.error('Failed to send OpenClaw reply', String(err)),
      );
    }

    return { success: true, response: execResult };
  }

  private formatOpenClawCommandReply(execResult: any): string {
    if (!execResult?.success) {
      return execResult?.error ?? 'Command failed';
    }
    const data = execResult.data;
    if (execResult.deferOpenClawThreadReply) {
      return '';
    }
    if (data?.commands && Array.isArray(data.commands)) {
      return [
        '📋 **Topic Hub**',
        '',
        '**Topic lifecycle**',
        '1. **Identity + bind** — DM the bot: `/id create` (self-serve identity token) or use a superadmin-provisioned token; then `/register <code>` (code from `topic-hub serve` on your machine). Keep serve running.',
        '2. **Open a topic** — In the group channel: `/create <type>` (optional `--title "…"`). Each group may have **one** non-`closed` topic at a time; set status to `closed` (or reopen an old one) before creating another.',
        '3. **Work** — Plain text in that group is relayed to your local executor while a topic is active. Optional **agent `#N`** prefix on plain lines or `/SkillName #N …` targets a **local agent slot** (see **`/agent list`**); default is **agent `#1`**. Use **`/agent #M <line>`** to force roster slot **M** for that line (plain text or **`/Skill …`**). There is **no** Hub-side `/queue` or `/answer` — ordering and follow-ups are handled by your **local executor** (e.g. per-slot session). `/use <skill>` or `/SkillName …` to run a loaded skill.',
        '4. **Track** — `/show`, `/timeline`, and `/history` are answered **in this chat** from Topic Hub (no local executor).',
        '5. **Status** — `/update --status <s>` moves the topic. Valid values: `open`, `in_progress`, `resolved`, `closed` (only **allowed** transitions apply; the bot explains if a jump is invalid).',
        '6. **Handoff** — `/assign --user <id>` sets assignee (when permitted).',
        '7. **Done or restart** — `/update --status closed` (or `resolved` then `closed`) finishes the topic; `/reopen` revives a closed topic in this group when there is no other active topic (check `/history` if you have many).',
        '',
        '**DM only** (direct message with bot):',
        '`/id create` · `/id me` identity (DM) · `/register <code>` bind executor · `/unregister` unbind · `/skills list` browse published skills (no link required) · `/skills star <name>` like/unlike (after `/register`, with serve running)',
        '',
        '**Group only** (server / group channel):',
        '`/create <type>` new topic in **this channel**',
        '`/show` details · `/timeline` history · `/update --status <s>`',
        '`/assign --user <id>` · `/reopen` · `/history`',
        '`/search --type <t>` · `/use <skill>` invoke skill',
        '`/agent list` · `/agent create` · `/agent delete #N` · `/agent #M <anything>` → slot M',
        'Plain text (with an active topic) is sent to your local executor.',
        '`/RegisteredSkillName …` runs that skill via the local executor when the name matches a loaded skill.',
        '',
        '**Any chat:**',
        '`/help` this message',
      ].join('\n');
    }
    if (typeof execResult.message === 'string' && execResult.message.trim()) {
      return execResult.message.trim();
    }
    return 'Task dispatched to your local agent.';
  }

  private formatImIdSnapshot(snapshot: ImSelfServeIdentitySnapshot): string {
    return [
      '**Identity**',
      '',
      `- **name**: ${snapshot.displayName}`,
      `- **id** (uniqueId): \`${snapshot.uniqueId}\``,
      `- **token**: \`${snapshot.token}\``,
      '',
      '_Store your token securely. Topic Hub shows it in this DM by product design (self-serve onboarding)._',
    ].join('\n');
  }

  private async handleImIdCommands(result: OpenClawInboundResult, cmd: string): Promise<WebhookResult> {
    if (!this.bridge) {
      return { success: false, error: 'Bridge not configured' };
    }
    if (!this.imSelfServeOps) {
      this.sendThreadReply(
        result,
        'IM `/id` self-registration is not available on this deployment.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'id_unconfigured' } };
    }
    if (!result.isDm) {
      this.sendThreadReply(
        result,
        'Use `/id` in a **direct message** with the bot so your token is not shown in a group channel.',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'id_dm_only' } };
    }

    const trimmed = cmd.trim();
    if (trimmed === '/id' || trimmed === '/id help' || trimmed.startsWith('/id help ')) {
      this.sendThreadReply(
        result,
        '**`/id` commands** (DM only)\n\n- `/id create` — register this IM account and receive your identity token\n- `/id me` — show your name, id (uniqueId), and token',
      ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
      return { success: true, response: { status: 'id_usage' } };
    }

    if (trimmed.startsWith('/id create')) {
      if (trimmed !== '/id create') {
        this.sendThreadReply(result, 'Use exactly `/id create` with no extra arguments.').catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'id_create_usage' } };
      }
      const displayName = result.imDisplayName?.trim() || result.userId;
      try {
        const snap = await this.imSelfServeOps.createFromIm({
          platform: result.platform,
          platformUserId: result.userId,
          displayName,
        });
        const msg = [
          '**Registered** — save this token for `topichub-admin serve` / CLI login.',
          '',
          this.formatImIdSnapshot(snap),
        ].join('\n');
        // CONSTITUTION-EXCEPTION: intentional identity token in IM — specs/017-im-first-identification/spec.md § Clarifications
        this.sendThreadReply(result, msg).catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'id_created' } };
      } catch (e) {
        if (e instanceof ConflictError) {
          this.sendThreadReply(result, e.message).catch((err) =>
            this.logger.error('Failed to send OpenClaw reply', String(err)),
          );
          return { success: true, response: { status: 'id_conflict' } };
        }
        this.logger.error('IM /id create failed', e instanceof Error ? e.message : String(e));
        this.sendThreadReply(result, 'Registration failed. Try again or contact an administrator.').catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'id_error' } };
      }
    }

    if (trimmed.startsWith('/id me')) {
      if (trimmed !== '/id me') {
        this.sendThreadReply(result, 'Use exactly `/id me` with no extra arguments.').catch((err) =>
          this.logger.error('Failed to send OpenClaw reply', String(err)),
        );
        return { success: true, response: { status: 'id_me_usage' } };
      }
      let snap: ImSelfServeIdentitySnapshot | null = null;
      const bound = await this.identityOps?.resolveUserByPlatform(result.platform, result.userId);
      if (bound) {
        snap = await this.imSelfServeOps.getByIdentityId(bound.topichubUserId);
      }
      if (!snap) {
        snap = await this.imSelfServeOps.getMeForIm({
          platform: result.platform,
          platformUserId: result.userId,
        });
      }
      if (!snap) {
        this.sendThreadReply(
          result,
          'No identity found for this IM account yet. Run `/register <code>` to view your paired identity, or run `/id create` first.',
        ).catch((err) => this.logger.error('Failed to send OpenClaw reply', String(err)));
        return { success: true, response: { status: 'id_not_registered' } };
      }
      // CONSTITUTION-EXCEPTION: intentional identity token in IM — specs/017-im-first-identification/spec.md § Clarifications
      this.sendThreadReply(result, this.formatImIdSnapshot(snap)).catch((err) =>
        this.logger.error('Failed to send OpenClaw reply', String(err)),
      );
      return { success: true, response: { status: 'id_me' } };
    }

    this.sendThreadReply(result, 'Unknown `/id` command. Try `/id create`, `/id me`, or `/help`.').catch((err) =>
      this.logger.error('Failed to send OpenClaw reply', String(err)),
    );
    return { success: true, response: { status: 'id_unknown' } };
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
        'Invalid pairing code. Copy the code shown next to `topichub-admin serve` (DM only) and try again.',
      );
      return { success: false, error: 'Failed to claim pairing code' };
    }
  }

  /**
   * Pairing commands can arrive with extra text/newlines from some IM clients.
   * We only treat the first non-whitespace token as the code.
   */
  private extractPairingCodeFromRegisterCommand(cmd: string): string {
    if (cmd === '/register') return '';
    const raw = cmd.slice('/register'.length).trim();
    if (!raw) return '';
    const [firstToken] = raw.split(/\s+/);
    return firstToken?.trim() ?? '';
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

}
