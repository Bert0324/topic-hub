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
}

export interface ExecutionResult {
  text: string;
  executorType: string;
  tokenUsage?: { input: number; output: number };
  durationMs: number;
  exitCode: number;
}

export interface AgentExecutor {
  readonly type: string;
  execute(
    prompt: string,
    systemPromptPath: string | null,
    options: ExecutorOptions,
  ): Promise<ExecutionResult>;
}
