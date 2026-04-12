import { spawn } from 'child_process';
import matter from 'gray-matter';
import type { AgentExecutor, ExecutionResult, ExecutorOptions } from './executor.interface.js';
import { spawnOptionsWithExecutorCwd } from './spawn-agent-options.js';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class CodexExecutor implements AgentExecutor {
  readonly type = 'codex';

  async execute(
    prompt: string,
    systemPromptPath: string | null,
    options: ExecutorOptions = {},
  ): Promise<ExecutionResult> {
    const timeoutMs =
      options.timeoutMs !== undefined ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    let fullPrompt = prompt;
    if (systemPromptPath) {
      const fs = await import('fs');
      const raw = fs.readFileSync(systemPromptPath, 'utf-8');
      // Same SKILL.md files as Claude (`--append-system-prompt-file`); Codex has no file flag — inline
      // body only so YAML frontmatter does not pollute the exec prompt.
      const parsed = matter(raw);
      const body = typeof parsed.content === 'string' ? parsed.content.trim() : '';
      const systemPrompt = body.length > 0 ? body : raw.trim();
      fullPrompt = `${systemPrompt}\n\n---\n\n${prompt}`;
    }

    // Put user flags after `exec` and before `--json` so Codex parses options (e.g. --full-auto) correctly.
    const args = ['exec', ...(options.extraArgs ?? []), '--json', '--ephemeral', fullPrompt];

    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath);
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      const baseSpawnOpts: import('child_process').SpawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
      };
      const spawnOpts = spawnOptionsWithExecutorCwd(baseSpawnOpts, options);
      if (timeoutMs > 0) {
        spawnOpts.timeout = timeoutMs;
      }
      const child = spawn('codex', args, spawnOpts);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const durationMs = Date.now() - startTime;

        let text = stdout;
        let tokenUsage: { input: number; output: number } | undefined;

        // Codex outputs JSONL — look for the last completed turn
        try {
          const lines = stdout.trim().split('\n').filter(Boolean);
          for (let i = lines.length - 1; i >= 0; i--) {
            const parsed = JSON.parse(lines[i]);
            if (parsed.type === 'turn/completed' || parsed.type === 'message') {
              text = parsed.message?.content ?? parsed.content ?? parsed.text ?? text;
              if (parsed.usage) {
                tokenUsage = {
                  input: parsed.usage.input_tokens ?? 0,
                  output: parsed.usage.output_tokens ?? 0,
                };
              }
              break;
            }
          }
        } catch {
          // Not JSONL — use raw stdout
        }

        if (code !== 0 && code !== null) {
          const errorMsg = stderr || text || `Codex exited with code ${code}`;
          resolve({
            text: errorMsg,
            executorType: 'codex',
            tokenUsage,
            durationMs,
            exitCode: code,
          });
          return;
        }

        resolve({
          text,
          executorType: 'codex',
          tokenUsage,
          durationMs,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'Codex CLI (`codex`) not found on PATH. Install it with: npm install -g @openai/codex',
            ),
          );
        } else {
          reject(err);
        }
      });
    });
  }
}
