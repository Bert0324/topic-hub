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
import { purifyImRelayText } from '@topichub/core';

export interface TaskProcessorOptions {
  serverUrl: string;
  token: string;
  skillsDir: string;
  configExecutor: ExecutorType;
  cliExecutorFlag?: string;
  executorArgs?: string[];
  maxConcurrentAgents?: number;
  onEventUpdate: (entry: EventLogEntry) => void;
  onAgentQuestion?: (dispatchId: string, question: string, context?: { skillName: string; topicTitle: string }) => Promise<string | null>;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  executor?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Hard cap for each `claude` / `codex` subprocess under `serve`.
 * Set `TOPICHUB_AGENT_TIMEOUT_MS=0` to disable (no Node spawn timeout — can hang indefinitely).
 */
function resolveDispatchAgentTimeoutMs(): number {
  const raw = process.env.TOPICHUB_AGENT_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TIMEOUT_MS;
  return n;
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

export class TaskProcessor {
  private readonly api: ApiClient;
  private readonly claimId: string;
  private activeCount = 0;
  private readonly activeDispatches = new Set<string>();

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
    return this.options.maxConcurrentAgents ?? 1;
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
    this.activeCount++;
    this.activeDispatches.add(dispatchId);
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

    try {
      const claimed = await this.claimDispatch(dispatchId);
      if (!claimed) {
        logEntry.status = 'failed';
        logEntry.error = 'Already claimed';
        console.log(`[ERROR]    Failed: Already claimed (dispatch ${dispatchId})`);
        return;
      }

      console.log(`[CLAIM]    Claimed dispatch ${dispatchId}`);

      const { systemPromptPath, frontmatter } = this.loadSkill(dispatch.skillName);

      // Claim API historically omitted `enrichedPayload`; SSE payload may still carry it — merge so the agent always sees topic + event.
      const promptPayload = {
        ...(typeof claimed === 'object' && claimed !== null ? claimed : {}),
        enrichedPayload:
          (claimed as any)?.enrichedPayload ??
          (dispatch as any).enrichedPayload,
      };

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

      const execOptions: ExecutorOptions = {
        timeoutMs: resolveDispatchAgentTimeoutMs(),
        maxTurns: frontmatter?.maxTurns,
        allowedTools: frontmatter?.allowedTools,
        mcpConfigPath,
        extraArgs: this.options.executorArgs,
        headless: true,
      };

      const startMs = Date.now();
      let result: ExecutionResult;
      try {
        result = await executor.execute(prompt, systemPromptPath, execOptions);
      } finally {
        cleanupMcpConfig(mcpConfigPath);
      }

      const elapsed = result.durationMs ?? Date.now() - startMs;

      if (result.exitCode === 0) {
        const imSummary = await maybeSummarizeForIm(
          result.text,
          executorType,
          this.options.executorArgs,
        );
        const payload =
          imSummary != null
            ? { ...result, imSummary }
            : result;
        await this.completeDispatch(dispatchId, payload);
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

      await this.writeTimelineEntry(dispatch, topicIdStr, result);
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
      this.activeCount--;
      this.activeDispatches.delete(dispatchId);
      this.options.onEventUpdate(logEntry);
    }
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
    const userLine = extractUserFacingInput(event);
    const topicJson = JSON.stringify(payload.topic ?? {}, null, 2);
    const eventJson = JSON.stringify(event ?? {}, null, 2);

    const looksLikePureGreeting =
      userLine.length > 0 &&
      userLine.length <= 40 &&
      /^(hi|hello|hey|yo|你好|在吗|在么|您好|早上好|下午好|晚上好)\b[!?.。！？\s]*$/i.test(userLine.trim());

    const sections: string[] = [
      '# Role',
      'You are the **topic assistant** in a group chat. Write for **end users** (teammates), not for engineers.',
      '',
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
