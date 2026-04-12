export interface ExecutorOptions {
  /** Agent subprocess timeout. `0` = no Node `spawn` timeout (runs until the CLI exits). */
  timeoutMs?: number;
  maxTurns?: number;
  mcpConfigPath?: string;
  skillMdPath?: string;
  allowedTools?: string[];
  extraArgs?: string[];
  /**
   * Set by `serve` / automation: non-interactive subprocess (no TTY).
   * Claude Code gets `--permission-mode` (default `bypassPermissions`; override with
   * `TOPICHUB_CLAUDE_PERMISSION_MODE` or `executorArgs --permission-mode`).
   */
  headless?: boolean;
  /**
   * Working directory for the agent subprocess (any {@link AgentExecutor}).
   * When set, local project conventions such as `.claude/skills` resolve from this path.
   */
  cwd?: string;
}

export interface ExecutionResult {
  text: string;
  executorType: string;
  tokenUsage?: { input: number; output: number };
  durationMs: number;
  exitCode: number;
}

/**
 * Local agent CLI backend. Implementations spawn a subprocess (or equivalent) and MUST honor
 * {@link ExecutorOptions.cwd} when set so project roots and tool-specific dirs (e.g. `.claude/skills`)
 * resolve consistently — including any executor added in the future.
 */
export interface AgentExecutor {
  readonly type: string;
  execute(
    prompt: string,
    systemPromptPath: string | null,
    options: ExecutorOptions,
  ): Promise<ExecutionResult>;
}
