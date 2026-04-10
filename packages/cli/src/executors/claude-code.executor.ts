import { spawn } from 'child_process';
import type { AgentExecutor, ExecutionResult, ExecutorOptions } from './executor.interface.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class ClaudeCodeExecutor implements AgentExecutor {
  readonly type = 'claude-code';

  async execute(
    prompt: string,
    systemPromptPath: string | null,
    options: ExecutorOptions = {},
  ): Promise<ExecutionResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    const args: string[] = [];

    if (options.extraArgs?.length) {
      args.push(...options.extraArgs);
    }

    args.push('-p', prompt, '--output-format', 'json', '--verbose');

    if (systemPromptPath) {
      args.push('--append-system-prompt-file', systemPromptPath);
    }

    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath);
    }

    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns));
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      const child = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const durationMs = Date.now() - startTime;

        let text = stdout;
        let tokenUsage: { input: number; output: number } | undefined;

        try {
          const parsed = JSON.parse(stdout);
          text = parsed.result ?? parsed.content ?? parsed.text ?? stdout;
          if (parsed.usage) {
            tokenUsage = {
              input: parsed.usage.input_tokens ?? parsed.usage.inputTokens ?? 0,
              output: parsed.usage.output_tokens ?? parsed.usage.outputTokens ?? 0,
            };
          }
        } catch {
          // stdout wasn't valid JSON — use raw text
        }

        if (code !== 0 && code !== null) {
          const errorMsg = stderr || text || `Claude Code exited with code ${code}`;
          resolve({
            text: errorMsg,
            executorType: 'claude-code',
            tokenUsage,
            durationMs,
            exitCode: code,
          });
          return;
        }

        resolve({
          text,
          executorType: 'claude-code',
          tokenUsage,
          durationMs,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'Claude Code CLI (`claude`) not found on PATH. Install it with: npm install -g @anthropic-ai/claude-code',
            ),
          );
        } else {
          reject(err);
        }
      });
    });
  }
}
