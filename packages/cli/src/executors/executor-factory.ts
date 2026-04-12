import type { AgentExecutor } from './executor.interface.js';
import { ClaudeCodeExecutor } from './claude-code.executor.js';
import { CodexExecutor } from './codex.executor.js';
import { detectAgents } from './detector.js';
import type { ExecutorType } from '../config/config.schema.js';

export interface ExecutorResolutionContext {
  skillFrontmatter?: { executor?: string };
  cliFlag?: string;
  envVar?: string;
  configValue?: ExecutorType;
}

/**
 * Resolution order: Skill frontmatter → CLI flag → env TOPICHUB_EXECUTOR → config file → auto-detect
 */
export function resolveExecutorType(ctx: ExecutorResolutionContext): string {
  if (ctx.skillFrontmatter?.executor) return ctx.skillFrontmatter.executor;
  if (ctx.cliFlag) return ctx.cliFlag;
  if (ctx.envVar) return ctx.envVar;
  if (ctx.configValue && ctx.configValue !== 'none') return ctx.configValue;

  const detected = detectAgents();
  if (detected.length > 0) return detected[0].type;

  throw new Error(
    'No AI agent executor available. Install Claude Code (`claude`) or Codex (`codex`), ' +
      'or run `topichub-admin init` to configure an executor.',
  );
}

export function createExecutor(type: string): AgentExecutor {
  switch (type) {
    case 'claude-code':
      return new ClaudeCodeExecutor();
    case 'codex':
      return new CodexExecutor();
    default:
      throw new Error(
        `Unknown executor type: "${type}". Supported: claude-code, codex`,
      );
  }
}
