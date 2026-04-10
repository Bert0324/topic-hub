import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { ApiClient } from '../../api-client/api-client.js';
import {
  resolveExecutorType,
  createExecutor,
} from '../../executors/executor-factory.js';
import type { ExecutionResult, ExecutorOptions } from '../../executors/executor.interface.js';
import { writeMcpConfig, cleanupMcpConfig } from '../../mcp/mcp-config-writer.js';
import type { ExecutorType } from '../../config/config.schema.js';
import type { DispatchEvent } from './event-consumer.js';
import type { EventLogEntry } from './status-display.js';

export interface TaskProcessorOptions {
  serverUrl: string;
  token: string;
  skillsDir: string;
  configExecutor: ExecutorType;
  cliExecutorFlag?: string;
  executorArgs?: string[];
  onEventUpdate: (entry: EventLogEntry) => void;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  executor?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class TaskProcessor {
  private readonly api: ApiClient;
  private readonly claimId: string;
  private processing = false;

  constructor(private readonly options: TaskProcessorOptions) {
    this.api = new ApiClient(options.serverUrl);
    this.api.setToken(options.token);
    this.claimId = `cli:${require('os').hostname()}:${process.pid}`;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  async process(dispatch: DispatchEvent): Promise<void> {
    this.processing = true;
    const topicTitle =
      (dispatch as any).enrichedPayload?.topic?.title ??
      `topic:${dispatch.topicId}`;

    const logEntry: EventLogEntry = {
      timestamp: new Date(),
      skillName: dispatch.skillName,
      topicTitle,
      status: 'running',
    };

    console.log(
      `[DISPATCH] Received: ${dispatch.topicId} / ${dispatch.skillName} / ${dispatch.eventType}`,
    );
    this.options.onEventUpdate(logEntry);

    try {
      const claimed = await this.claimDispatch(dispatch.id);
      if (!claimed) {
        logEntry.status = 'failed';
        logEntry.error = 'Already claimed';
        console.log(`[ERROR]    Failed: Already claimed (dispatch ${dispatch.id})`);
        this.options.onEventUpdate(logEntry);
        return;
      }

      console.log(`[CLAIM]    Claimed dispatch ${dispatch.id}`);

      const { systemPromptPath, frontmatter } = this.loadSkill(dispatch.skillName);

      const prompt = this.buildPrompt(claimed);

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

      console.log(`[AGENT]    Running ${executorType} with ${dispatch.skillName}...`);

      const execOptions: ExecutorOptions = {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxTurns: frontmatter?.maxTurns,
        allowedTools: frontmatter?.allowedTools,
        mcpConfigPath,
        extraArgs: this.options.executorArgs,
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
        await this.completeDispatch(dispatch.id, result);
        logEntry.status = 'completed';
        logEntry.durationMs = elapsed;
        console.log(`[RESULT]   Completed in ${elapsed}ms`);
      } else {
        await this.failDispatch(dispatch.id, result.text, true);
        logEntry.status = 'failed';
        logEntry.durationMs = elapsed;
        logEntry.error = 'Agent error';
        console.log(
          `[ERROR]    Failed: Agent error (dispatch ${dispatch.id})`,
        );
      }

      await this.writeTimelineEntry(dispatch, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logEntry.status = 'failed';
      logEntry.error = msg;
      console.error(
        `[ERROR]    Failed: ${msg} (dispatch ${dispatch.id})`,
      );
      console.error(
        `           Skill: ${dispatch.skillName} | Topic: ${dispatch.topicId}`,
      );
      if (stack) {
        console.error(`           ${stack}`);
      }
      try {
        await this.failDispatch(dispatch.id, msg, true);
      } catch {
        // Best-effort
      }
    } finally {
      this.processing = false;
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
    result: ExecutionResult,
  ): Promise<void> {
    await this.api.post(`/api/v1/dispatches/${dispatchId}/complete`, {
      result: {
        text: result.text,
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
    result: ExecutionResult,
  ): Promise<void> {
    try {
      await this.api.post(`/api/v1/topics/${dispatch.topicId}/timeline`, {
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

  private buildPrompt(claimedDispatch: any): string {
    const payload =
      claimedDispatch.enrichedPayload ?? claimedDispatch;

    return [
      'You are processing a task dispatch from Topic Hub.',
      '',
      '## Topic',
      JSON.stringify(payload.topic ?? payload, null, 2),
      '',
      '## Event',
      JSON.stringify(payload.event ?? {}, null, 2),
      '',
      payload.aiClassification
        ? `## Server AI Classification\n${JSON.stringify(payload.aiClassification, null, 2)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private resolveSkillsDir(): string {
    const dir = this.options.skillsDir;
    if (dir.startsWith('~')) {
      return path.join(process.env.HOME ?? '', dir.slice(1));
    }
    return path.resolve(dir);
  }
}
