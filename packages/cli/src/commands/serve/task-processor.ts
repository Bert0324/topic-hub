import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { ApiClient } from '../../api-client/api-client.js';
import {
  resolveExecutorType,
  createExecutor,
} from '../../executors/executor-factory.js';
import { maybeSummarizeForIm } from '../../executors/summarize-for-im.js';
import type { ExecutionResult, ExecutorOptions } from '../../executors/executor.interface.js';
import { writeMcpConfig, cleanupMcpConfig } from '../../mcp/mcp-config-writer.js';
import type { ExecutorType } from '../../config/config.schema.js';
import type { DispatchEvent } from './event-consumer.js';
import type { EventLogEntry } from './status-display.js';
import {
  DEFAULT_MAX_CONCURRENT_AGENTS,
  MAX_LOCAL_AGENTS,
  getImTaskCompletionBodyBudgetChars,
  purifyImRelayText,
  IM_PAYLOAD_AGENT_DELETE_SLOT_KEY,
  IM_PAYLOAD_AGENT_OP_KEY,
  IM_PAYLOAD_AGENT_SLOT_KEY,
  formatAgentCreateAck,
  formatAgentDeleteAck,
  formatAgentRosterListMarkdown,
  parseImAgentControlOpFromEnrichedPayload,
} from '@topichub/core';
import { resolveAgentWorkingDir } from './resolve-agent-cwd.js';
import {
  extractLeadingSlashToken,
  findClaudeProjectSkillMd,
} from './claude-project-skill.js';
import {
  addAgent,
  ensureAtLeastOneAgent,
  listAgentSlots,
  loadAgents,
  markClaudeHeadlessSessionReady,
  removeAgentAtSlot,
  setAgentSlotBusy,
} from './agent-roster.js';

export interface TaskProcessorOptions {
  serverUrl: string;
  token: string;
  skillsDir: string;
  configExecutor: ExecutorType;
  cliExecutorFlag?: string;
  executorArgs?: string[];
  maxConcurrentAgents?: number;
  /**
   * Optional cwd override (`serve --agent-cwd` or `TOPICHUB_AGENT_CWD`). If unset, agent cwd defaults
   * to `INIT_CWD` (shell directory when `pnpm`/`npm` started the script) or `process.cwd()`. Per-topic `metadata.executorCwd` still wins when valid.
   */
  sessionAgentCwd?: string;
  onEventUpdate: (entry: EventLogEntry) => void;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  executor?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** Ask the server to extend the dispatch claim while an agent is still running. */
const CLAIM_RENEW_INTERVAL_MS = 120_000;

/**
 * Hard cap for each local agent subprocess under `serve`.
 * Set `TOPICHUB_AGENT_TIMEOUT_MS=0` to disable (no Node spawn timeout — can hang indefinitely).
 */
function resolveDispatchAgentTimeoutMs(): number {
  const raw = process.env.TOPICHUB_AGENT_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TIMEOUT_MS;
  return n;
}

function claudeHeadlessSessionOpts(
  executorType: string,
  token: string,
  slot1Based: number,
): Pick<ExecutorOptions, 'claudeSessionId' | 'claudeResumeSession'> {
  if (executorType !== 'claude-code' || process.env.TOPICHUB_CLAUDE_IM_SESSION === '0') {
    return {};
  }
  const agents = loadAgents(token);
  const e = agents[slot1Based - 1];
  if (!e?.id) {
    return {};
  }
  const sid = e.id.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
    return {};
  }
  return {
    claudeSessionId: sid,
    claudeResumeSession: e.claudeHeadlessResume === true,
  };
}

function truncateOneLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  if (max <= 8) return one.slice(0, max);
  return `${one.slice(0, max - 7)}…(more)`;
}

function mongoIdToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && typeof (value as { toString?: () => string }).toString === 'function') {
    const s = (value as { toString: () => string }).toString();
    if (s && s !== '[object Object]') return s;
  }
  return String(value);
}

function getDispatchId(dispatch: DispatchEvent & { _id?: unknown }): string {
  const raw = dispatch.id ?? (dispatch as { _id?: unknown })._id;
  const id = mongoIdToString(raw);
  if (!id) {
    throw new Error('Dispatch payload missing id/_id (cannot claim)');
  }
  return id;
}

/** What the human typed in IM (after server-side relay purification). */
function extractUserFacingInput(event: { payload?: unknown } | undefined): string {
  const p = event?.payload;
  if (p == null) return '';
  if (typeof p === 'string') return purifyImRelayText(p);
  if (typeof p !== 'object') return '';
  const o = p as Record<string, unknown>;
  const chunks: string[] = [];
  if (typeof o.text === 'string' && o.text.trim()) {
    chunks.push(purifyImRelayText(o.text));
  }
  if (typeof o.imText === 'string' && o.imText.trim()) {
    chunks.push(purifyImRelayText(o.imText));
  }
  if (o.slashArgs && typeof o.slashArgs === 'object' && Object.keys(o.slashArgs as object).length > 0) {
    chunks.push(
      'Structured slash-command arguments (for `/SkillName …` invocations):',
      JSON.stringify(o.slashArgs, null, 2),
    );
  }
  return chunks.join('\n\n').trim();
}

/** 1-based roster slot from SSE / pre-claim `enrichedPayload` (defaults to **#1**). */
function readImAgentSlotFromEnrichedDispatch(dispatch: DispatchEvent): number {
  const ep = (dispatch as { enrichedPayload?: { event?: { payload?: unknown } } }).enrichedPayload;
  const pRaw = ep?.event?.payload;
  if (pRaw == null || typeof pRaw !== 'object' || Array.isArray(pRaw)) {
    return 1;
  }
  const raw = (pRaw as Record<string, unknown>)[IM_PAYLOAD_AGENT_SLOT_KEY];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.min(MAX_LOCAL_AGENTS, Math.max(1, Math.floor(raw)));
  }
  return 1;
}

export class TaskProcessor {
  private readonly api: ApiClient;
  private readonly claimId: string;
  private activeCount = 0;
  private readonly activeDispatches = new Set<string>();
  /**
   * One async chain per roster slot so two dispatches for the same headless Claude session never run
   * concurrently (avoids “session id already in use”).
   */
  private readonly slotSerializationTails = new Map<number, Promise<void>>();

  constructor(private readonly options: TaskProcessorOptions) {
    this.api = new ApiClient(options.serverUrl);
    this.api.setToken(options.token);
    this.claimId = `cli:${require('os').hostname()}:${process.pid}`;
  }

  get isProcessing(): boolean {
    return this.activeCount > 0;
  }

  get activeTaskCount(): number {
    return this.activeCount;
  }

  get concurrencyLimit(): number {
    return this.options.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT_AGENTS;
  }

  canAcceptMore(): boolean {
    return this.activeCount < this.concurrencyLimit;
  }

  async process(dispatch: DispatchEvent): Promise<void> {
    const dispatchId = getDispatchId(dispatch);
    if (this.activeDispatches.has(dispatchId)) {
      console.log(`[DISPATCH] Skip duplicate in-flight ${dispatchId}`);
      return;
    }

    const imControlFromSse = parseImAgentControlOpFromEnrichedPayload(
      (dispatch as { enrichedPayload?: unknown }).enrichedPayload,
    );

    this.activeDispatches.add(dispatchId);
    try {
      if (imControlFromSse != null) {
        await this.runDispatchPipeline(dispatch, dispatchId);
        return;
      }
      const slot = readImAgentSlotFromEnrichedDispatch(dispatch);
      const hadPriorOnSlot = this.slotSerializationTails.has(slot);
      if (hadPriorOnSlot) {
        void this.api
          .post<{ ok: boolean }>(`/api/v1/dispatches/${dispatchId}/notify-queued-local`, {})
          .then((r) => {
            if (r?.ok) {
              console.log(
                `[QUEUE]    **Agent #${slot}** — posted "queued" notice to the topic group (dispatch ${dispatchId.slice(0, 8)}…).`,
              );
            }
          })
          .catch((err) => {
            console.warn(
              `[QUEUE]    Could not post "queued" notice to IM: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
      const prevTail = this.slotSerializationTails.get(slot) ?? Promise.resolve();
      const runAfterPrior = async () => {
        if (hadPriorOnSlot) {
          console.log(
            `[QUEUE]    **Agent #${slot}** — starting this dispatch after the prior task on this slot finished.`,
          );
        }
        await this.runDispatchPipeline(dispatch, dispatchId);
      };
      const nextTail = prevTail.then(runAfterPrior, runAfterPrior);
      this.slotSerializationTails.set(slot, nextTail);
      await nextTail;
      if (this.slotSerializationTails.get(slot) === nextTail) {
        this.slotSerializationTails.delete(slot);
      }
    } finally {
      this.activeDispatches.delete(dispatchId);
    }
  }

  private async runDispatchPipeline(dispatch: DispatchEvent, dispatchId: string): Promise<void> {
    const imControlFromSse = parseImAgentControlOpFromEnrichedPayload(
      (dispatch as { enrichedPayload?: unknown }).enrichedPayload,
    );
    const reservesConcurrency = imControlFromSse == null;
    if (reservesConcurrency) {
      this.activeCount++;
    }
    const topicIdStr = mongoIdToString(dispatch.topicId) || String(dispatch.topicId);
    const topicTitle =
      (dispatch as any).enrichedPayload?.topic?.title ??
      `topic:${topicIdStr}`;

    const logEntry: EventLogEntry = {
      dispatchId,
      timestamp: new Date(),
      skillName: dispatch.skillName,
      topicTitle,
      status: 'running',
    };

    console.log(
      `[DISPATCH] Received: ${topicIdStr} / ${dispatch.skillName} / ${dispatch.eventType}`,
    );
    this.options.onEventUpdate(logEntry);

    let claimRenewTimer: ReturnType<typeof setInterval> | undefined;
    let slotMarkedBusy: number | null = null;
    try {
      const claimed = await this.claimDispatch(dispatchId);
      if (!claimed) {
        logEntry.status = 'failed';
        logEntry.error = 'Already claimed';
        console.log(`[ERROR]    Failed: Already claimed (dispatch ${dispatchId})`);
        return;
      }

      console.log(`[CLAIM]    Claimed dispatch ${dispatchId}`);

      const promptPayloadEarly = {
        ...(typeof claimed === 'object' && claimed !== null ? claimed : {}),
        enrichedPayload:
          (claimed as any)?.enrichedPayload ??
          (dispatch as any).enrichedPayload,
      };
      const mergedEp = (promptPayloadEarly as { enrichedPayload?: unknown }).enrichedPayload;
      const evEarly = (promptPayloadEarly as { enrichedPayload?: { event?: { payload?: unknown } } })
        .enrichedPayload?.event;
      const pRaw = evEarly?.payload;
      const plEarly =
        pRaw != null && typeof pRaw === 'object' && !Array.isArray(pRaw)
          ? (pRaw as Record<string, unknown>)
          : {};
      const agentCtlOp = parseImAgentControlOpFromEnrichedPayload(mergedEp);
      if (agentCtlOp != null) {
        const token = this.options.token;
        /** Same body as `/agent list` (bootstrap **#1** when needed). */
        const rosterListMarkdown = (): string => {
          ensureAtLeastOneAgent(token);
          const rows = listAgentSlots(token).map((r) => ({
            slot: r.slot,
            label: r.label,
            state: r.state,
          }));
          return formatAgentRosterListMarkdown(rows);
        };
        let out = '';
        if (agentCtlOp === 'list') {
          out = rosterListMarkdown();
        } else if (agentCtlOp === 'create') {
          const { newSlot } = addAgent(token);
          out = `${formatAgentCreateAck(newSlot)}\n\n${rosterListMarkdown()}`;
        } else {
          const n = plEarly[IM_PAYLOAD_AGENT_DELETE_SLOT_KEY];
          const slot = typeof n === 'number' ? n : parseInt(String(n), 10);
          const r = removeAgentAtSlot(token, slot);
          if (!r.ok) {
            const hintRows = listAgentSlots(token).map((row) => ({
              slot: row.slot,
              label: row.label,
              state: row.state,
            }));
            const errMsg =
              r.error.includes('busy') && hintRows.length > 0
                ? `${r.error}\n\n${formatAgentRosterListMarkdown(hintRows)}`
                : r.error;
            await this.failDispatch(dispatchId, errMsg, false);
            logEntry.status = 'failed';
            logEntry.error = truncateOneLine(errMsg, 200);
            return;
          }
          out = `${formatAgentDeleteAck(slot)}\n\n${rosterListMarkdown()}`;
        }
        await this.completeDispatch(dispatchId, {
          text: out,
          executorType: 'topichub-im-agent',
          durationMs: 0,
          exitCode: 0,
        });
        logEntry.status = 'completed';
        logEntry.durationMs = 0;
        console.log(`[RESULT]   IM agent control (${agentCtlOp}) completed`);
        return;
      }

      const renew = () => {
        void this.touchClaim(dispatchId).catch((err) => {
          console.warn(
            `[DISPATCH] touch-claim failed for ${dispatchId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      };
      renew();
      claimRenewTimer = setInterval(renew, CLAIM_RENEW_INTERVAL_MS);

      // Claim API historically omitted `enrichedPayload`; SSE payload may still carry it — merge so the agent always sees topic + event.
      const promptPayload = {
        ...(typeof claimed === 'object' && claimed !== null ? claimed : {}),
        enrichedPayload:
          (claimed as any)?.enrichedPayload ??
          (dispatch as any).enrichedPayload,
      };

      ensureAtLeastOneAgent(this.options.token);
      const evForSlot = (promptPayload as { enrichedPayload?: { event?: { payload?: unknown } } })
        .enrichedPayload?.event;
      const pSlot = evForSlot?.payload;
      const plSlot =
        pSlot != null && typeof pSlot === 'object' && !Array.isArray(pSlot)
          ? (pSlot as Record<string, unknown>)
          : {};
      const rawAgentSlot = plSlot[IM_PAYLOAD_AGENT_SLOT_KEY];
      const agentSlot1Based =
        typeof rawAgentSlot === 'number' && Number.isFinite(rawAgentSlot) && rawAgentSlot >= 1
          ? Math.floor(rawAgentSlot)
          : 1;
      slotMarkedBusy = agentSlot1Based;
      setAgentSlotBusy(this.options.token, agentSlot1Based, true);

      const topicMeta = (promptPayload as { enrichedPayload?: { topic?: { metadata?: Record<string, unknown> } } })
        .enrichedPayload?.topic?.metadata;
      const { cwd: agentCwd, source: agentCwdSource, topicExecutorCwdInvalid } = resolveAgentWorkingDir({
        topicMetadata: topicMeta,
        sessionDefaultCwd: this.options.sessionAgentCwd,
      });
      if (topicExecutorCwdInvalid) {
        console.warn(
          '[AGENT]    topic.metadata.executorCwd is not a valid directory; using session override or INIT_CWD / process.cwd().',
        );
      }
      if (agentCwd && agentCwdSource !== 'pwd') {
        console.log(`[AGENT]    subprocess cwd (${agentCwdSource}): ${agentCwd}`);
      }

      const eventForSkill = (promptPayload as { enrichedPayload?: { event?: { payload?: unknown } } })
        .enrichedPayload?.event;
      const userLineForProjectSkill = extractUserFacingInput(eventForSkill);
      const slashToken = extractLeadingSlashToken(userLineForProjectSkill);
      const projectSkillMatch = findClaudeProjectSkillMd(agentCwd, slashToken);

      const instr = (promptPayload as { enrichedPayload?: { skillInstructions?: Record<string, unknown> } })
        .enrichedPayload?.skillInstructions;
      const useServerSkill =
        instr &&
        typeof (instr as { primaryInstruction?: string }).primaryInstruction === 'string' &&
        ((instr as { primaryInstruction: string }).primaryInstruction as string).trim().length > 0;

      let systemPromptPath: string | null;
      let frontmatter: SkillFrontmatter;

      if (useServerSkill) {
        systemPromptPath = null;
        frontmatter = {
          name: (instr as { frontmatter?: { name?: string } }).frontmatter?.name,
          description: (instr as { frontmatter?: { description?: string } }).frontmatter?.description,
          executor: (instr as { frontmatter?: { executor?: string } }).frontmatter?.executor,
          maxTurns: (instr as { frontmatter?: { maxTurns?: number } }).frontmatter?.maxTurns,
          allowedTools: (instr as { frontmatter?: { allowedTools?: string[] } }).frontmatter?.allowedTools,
        } as SkillFrontmatter;
      } else {
        const base = this.loadSkill(dispatch.skillName);
        if (projectSkillMatch) {
          const raw = fs.readFileSync(projectSkillMatch.path, 'utf-8');
          const parsed = matter(raw);
          systemPromptPath = projectSkillMatch.path;
          frontmatter = { ...base.frontmatter, ...(parsed.data ?? {}) } as SkillFrontmatter;
          console.log(
            `[AGENT]    Project local skill (${projectSkillMatch.localBundle}): ${projectSkillMatch.skillDirName} → ${projectSkillMatch.path}`,
          );
        } else {
          systemPromptPath = base.systemPromptPath;
          frontmatter = base.frontmatter;
        }
      }

      const prompt = this.buildPrompt(promptPayload, !!systemPromptPath);

      const executorType = resolveExecutorType({
        skillFrontmatter: frontmatter,
        cliFlag: this.options.cliExecutorFlag,
        envVar: process.env.TOPICHUB_EXECUTOR,
        configValue: this.options.configExecutor,
      });
      const executor = createExecutor(executorType);

      const mcpConfigPath = writeMcpConfig({
        serverUrl: this.options.serverUrl,
        token: this.options.token,
        allowedTools: frontmatter?.allowedTools,
      });

      console.log(`[AGENT]    Running ${executorType} with ${dispatch.skillName} (headless)…`);

      const baseExecOptions: ExecutorOptions = {
        timeoutMs: resolveDispatchAgentTimeoutMs(),
        maxTurns: frontmatter?.maxTurns,
        allowedTools: frontmatter?.allowedTools,
        mcpConfigPath,
        extraArgs: this.options.executorArgs,
        headless: true,
        ...(agentCwd ? { cwd: agentCwd } : {}),
      };

      const buildExecOptions = (): ExecutorOptions => ({
        ...baseExecOptions,
        ...claudeHeadlessSessionOpts(executorType, this.options.token, agentSlot1Based),
      });

      const startMs = Date.now();
      let result: ExecutionResult;
      try {
        result = await executor.execute(prompt, systemPromptPath, buildExecOptions());
        if (result.exitCode === 0 && executorType === 'claude-code') {
          markClaudeHeadlessSessionReady(this.options.token, agentSlot1Based);
        }
      } finally {
        cleanupMcpConfig(mcpConfigPath);
      }

      const elapsed = result.durationMs ?? Date.now() - startMs;

      let timelineResult: ExecutionResult = result;
      if (result.exitCode === 0) {
        const sourcePlatform =
          (dispatch as { sourcePlatform?: string }).sourcePlatform ??
          (typeof claimed === 'object' && claimed !== null
            ? (claimed as { sourcePlatform?: string }).sourcePlatform
            : undefined);
        const imBodyBudget = getImTaskCompletionBodyBudgetChars(sourcePlatform);
        let completionText = result.text ?? '';
        completionText = `*(agent #${agentSlot1Based})*\n\n${completionText}`;
        const resultForIm: ExecutionResult = { ...result, text: completionText };
        const imSummary = await maybeSummarizeForIm(
          completionText,
          executorType,
          this.options.executorArgs,
          {
            imBodyBudgetChars: imBodyBudget,
            sourcePlatform,
            ...(agentCwd ? { agentCwd } : {}),
          },
        );
        const payload: ExecutionResult & { imSummary?: string } =
          imSummary != null ? { ...resultForIm, imSummary } : resultForIm;
        await this.completeDispatch(dispatchId, payload);
        timelineResult = payload;
        logEntry.status = 'completed';
        logEntry.durationMs = elapsed;
        console.log(`[RESULT]   Completed in ${elapsed}ms`);
      } else {
        const failText = result.text?.trim() || `exit code ${result.exitCode}`;
        await this.failDispatch(dispatchId, failText, true);
        logEntry.status = 'failed';
        logEntry.durationMs = elapsed;
        logEntry.error = truncateOneLine(
          `[${dispatchId.slice(0, 8)}…] ${failText}`,
          200,
        );
        console.log(
          `[ERROR]    Failed: ${failText.slice(0, 200)} (dispatch ${dispatchId})`,
        );
      }

      await this.writeTimelineEntry(dispatch, topicIdStr, timelineResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logEntry.status = 'failed';
      logEntry.error = truncateOneLine(
        `[${dispatchId.slice(0, 8)}…] ${msg}`,
        200,
      );
      console.error(
        `[ERROR]    Failed: ${msg} (dispatch ${dispatchId})`,
      );
      console.error(
        `           Skill: ${dispatch.skillName} | Topic: ${topicIdStr}`,
      );
      if (stack) {
        console.error(`           ${stack}`);
      }
      try {
        await this.failDispatch(dispatchId, msg, true);
      } catch {
        // Best-effort
      }
    } finally {
      if (slotMarkedBusy != null) {
        setAgentSlotBusy(this.options.token, slotMarkedBusy, false);
      }
      if (claimRenewTimer) {
        clearInterval(claimRenewTimer);
      }
      if (reservesConcurrency) {
        this.activeCount--;
      }
      this.options.onEventUpdate(logEntry);
    }
  }

  private async touchClaim(dispatchId: string): Promise<void> {
    await this.api.post(`/api/v1/dispatches/${dispatchId}/touch-claim`, {});
  }

  private async claimDispatch(dispatchId: string): Promise<any | null> {
    try {
      return await this.api.post(`/api/v1/dispatches/${dispatchId}/claim`, {
        claimedBy: this.claimId,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('409')) return null;
      throw err;
    }
  }

  private async completeDispatch(
    dispatchId: string,
    result: ExecutionResult & { imSummary?: string },
  ): Promise<void> {
    await this.api.post(`/api/v1/dispatches/${dispatchId}/complete`, {
      result: {
        text: result.text,
        ...(result.imSummary != null ? { imSummary: result.imSummary } : {}),
        executorType: result.executorType,
        tokenUsage: result.tokenUsage,
        durationMs: result.durationMs,
      },
    });
  }

  private async failDispatch(
    dispatchId: string,
    error: string,
    retryable: boolean,
  ): Promise<void> {
    await this.api.post(`/api/v1/dispatches/${dispatchId}/fail`, {
      error,
      retryable,
    });
  }

  private async writeTimelineEntry(
    dispatch: DispatchEvent,
    topicIdStr: string,
    result: ExecutionResult,
  ): Promise<void> {
    try {
      await this.api.post(`/api/v1/topics/${topicIdStr}/timeline`, {
        actionType: 'ai_response',
        actor: `ai:${dispatch.skillName}`,
        payload: {
          skillName: dispatch.skillName,
          content: result.text,
          executorType: result.executorType,
          durationMs: result.durationMs,
          tokenUsage: result.tokenUsage,
        },
      });
    } catch {
      // Non-fatal: dispatch is already marked complete
    }
  }

  private loadSkill(skillName: string): {
    systemPromptPath: string | null;
    frontmatter: SkillFrontmatter;
  } {
    const skillDir = this.resolveSkillsDir();
    const skillMdPath = path.join(skillDir, skillName, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return { systemPromptPath: null, frontmatter: {} };
    }

    const raw = fs.readFileSync(skillMdPath, 'utf-8');
    const parsed = matter(raw);

    return {
      systemPromptPath: skillMdPath,
      frontmatter: (parsed.data ?? {}) as SkillFrontmatter,
    };
  }

  private buildPrompt(claimedDispatch: any, hasSkillMdOnDisk: boolean): string {
    const payload = claimedDispatch.enrichedPayload ?? claimedDispatch;
    const event = payload.event ?? {};
    const rawPayload = event.payload;
    const eventForDisplay =
      rawPayload != null && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? {
            ...event,
            payload: (() => {
              const p = { ...(rawPayload as Record<string, unknown>) };
              delete p.queueAfterDispatchId;
              delete p[IM_PAYLOAD_AGENT_SLOT_KEY];
              delete p[IM_PAYLOAD_AGENT_OP_KEY];
              delete p[IM_PAYLOAD_AGENT_DELETE_SLOT_KEY];
              return p;
            })(),
          }
        : event;
    const publishedMiss =
      rawPayload != null &&
      typeof rawPayload === 'object' &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).publishedSkillRouting;
    const missHint =
      publishedMiss &&
        typeof publishedMiss === 'object' &&
        (publishedMiss as { status?: string }).status === 'miss' &&
        typeof (publishedMiss as { token?: string }).token === 'string'
        ? truncateOneLine(
          `No published Skill Center skill matched "${(publishedMiss as { token: string }).token}"; proceed using local skills / general instructions.`,
          240,
        )
        : '';

    const userLine = extractUserFacingInput(event);
    let agentSlotBanner = '';
    if (rawPayload != null && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
      const as = (rawPayload as Record<string, unknown>)[IM_PAYLOAD_AGENT_SLOT_KEY];
      if (typeof as === 'number' && Number.isFinite(as) && as >= 1) {
        agentSlotBanner =
          `# Local agent slot\n\nThis run is bound to **agent #${Math.floor(as)}** on your local executor (the user may run several in parallel).\n\n`;
      }
    }
    const topicJson = JSON.stringify(payload.topic ?? {}, null, 2);
    const eventJson = JSON.stringify(eventForDisplay ?? {}, null, 2);

    const looksLikePureGreeting =
      userLine.length > 0 &&
      userLine.length <= 40 &&
      /^(hi|hello|hey|yo|你好|在吗|在么|您好|早上好|下午好|晚上好)\b[!?.。！？\s]*$/i.test(userLine.trim());

    const sections: string[] = [
      '# Role',
      'You are the **topic assistant** in a group chat. Write for **end users** (teammates), not for engineers.',
      '',
      ...(agentSlotBanner ? [agentSlotBanner] : []),
      ...(missHint
        ? ['# Skill Center routing', missHint, '']
        : []),
      '# How to answer (strict)',
      '- Your final reply must be **natural language** suitable to post back into the chat.',
      '- Do **not** discuss JSON, HTTP, "dispatch", "claim", "executor", "Topic Hub internals", or empty `{}` fields.',
      '- Do **not** say you are a "serve process", "pipeline", or "presented with a task" unless the user explicitly asks how the system works.',
      '- If **What the user said** names a path, repo, file, 目录, 架构, analysis, or any concrete task, you must **carry it out** (use permitted tools such as Read / Bash / Glob / Grep when available) and summarize **real findings**. Never answer with only a generic welcome or onboarding blurb.',
      looksLikePureGreeting
        ? '- The user line looks like a short greeting only: reply in one or two sentences and offer specific help for this topic.'
        : '- Do **not** substitute a generic greeting ("here to help", "what are you working on") for a substantive user request.',
      '- Use the sections below as **context**: prefer answering from **What the user said** and **Skill playbook**; use **Topic snapshot** only when relevant.',
      '',
      '# What the user said (answer this first)',
      userLine
        ? ['```', userLine, '```'].join('\n')
        : '(No plain user line in this event — e.g. system-only notification. Use topic + skill playbook if still appropriate.)',
      '',
      '# Topic snapshot (read-only context)',
      '_Below is live JSON from the server (not an empty template). If keys look empty, say so briefly and still follow **What the user said**._',
      '```json',
      topicJson,
      '```',
      '',
      '# Event envelope (structured context — not your reply target)',
      'This block describes the event type, actor, and payloads Topic Hub attached. It is **not** something to debug aloud.',
      '```json',
      eventJson,
      '```',
      '',
    ];

    if (payload.skillInstructions?.primaryInstruction) {
      sections.push('# Skill playbook (behaviour — follow when answering)');
      sections.push(payload.skillInstructions.primaryInstruction);
      sections.push('');

      if (
        payload.skillInstructions.fullBody &&
        payload.skillInstructions.fullBody !== payload.skillInstructions.primaryInstruction
      ) {
        sections.push('# Skill playbook — extended reference');
        sections.push(payload.skillInstructions.fullBody);
        sections.push('');
      }
    } else if (hasSkillMdOnDisk) {
      sections.push('# Skill playbook');
      sections.push(
        'Rules for this topic type are in the **appended system prompt** (SKILL.md from disk). Follow them; do not ignore **What the user said**.',
      );
      sections.push('');
    } else {
      sections.push('# Skill playbook (default — no SKILL.md for this topic type on disk)');
      sections.push(
        'There is no dedicated SKILL.md for this skill name. Still: treat **What the user said** as the real task. ' +
        'When the user names absolute paths or asks for directory trees, architecture, or code exploration, use every tool you are allowed to run (e.g. Bash for `tree`/`find`/`ls`, Read for files) on the **host where you run** (often the machine running the executor), then answer with concrete structure and summaries—not a generic welcome.',
      );
      sections.push('');
    }

    if (payload.aiClassification) {
      sections.push('# Server-side hints (optional metadata)');
      sections.push('```json');
      sections.push(JSON.stringify(payload.aiClassification, null, 2));
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n').trim() + '\n';
  }

  private resolveSkillsDir(): string {
    const dir = this.options.skillsDir;
    if (dir.startsWith('~')) {
      return path.join(process.env.HOME ?? '', dir.slice(1));
    }
    return path.resolve(dir);
  }
}
