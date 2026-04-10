export interface ExecutorOptions {
  timeoutMs?: number;
  maxTurns?: number;
  mcpConfigPath?: string;
  skillMdPath?: string;
  allowedTools?: string[];
  extraArgs?: string[];
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
