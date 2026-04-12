import { spawn } from 'child_process';
import matter from 'gray-matter';
import type { AgentExecutor, ExecutionResult, ExecutorOptions } from './executor.interface.js';
import { spawnOptionsWithExecutorCwd } from './spawn-agent-options.js';
import { codexMcpConfigOverridesFromPath } from './codex-mcp-overrides.js';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function codexSpawnBaseOptions(): import('child_process').SpawnOptions {
  return {
    // `codex exec` reads "additional input from stdin" whenever fd0 stays open.
    // In headless serve mode this causes the subprocess to wait forever.
    stdio: ['ignore', 'pipe', 'pipe'],
  };
}

export function parseCodexJsonlOutput(stdout: string): {
  text: string;
  tokenUsage?: { input: number; output: number };
} {
  let text = stdout;
  let tokenUsage: { input: number; output: number } | undefined;
  let lastAssistantText: string | undefined;

  const lines = stdout.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const type = typeof parsed?.type === 'string' ? parsed.type : '';
    const usage = parsed?.usage;
    if (
      usage &&
      typeof usage === 'object' &&
      (type === 'turn.completed' || type === 'turn/completed' || type === 'message')
    ) {
      tokenUsage = {
        input: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
        output: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
      };
    }

    const fromMessage =
      typeof parsed?.message?.content === 'string'
        ? parsed.message.content
        : typeof parsed?.content === 'string'
          ? parsed.content
          : typeof parsed?.text === 'string'
            ? parsed.text
            : undefined;
    const fromItem =
      typeof parsed?.item?.text === 'string'
        ? parsed.item.text
        : typeof parsed?.item?.content === 'string'
          ? parsed.item.content
          : undefined;
    const candidate = (fromMessage ?? fromItem)?.trim();
    if (!candidate) {
      continue;
    }
    if (
      type === 'message' ||
      type === 'item.completed' ||
      type === 'item/completed' ||
      type === 'turn.completed' ||
      type === 'turn/completed'
    ) {
      lastAssistantText = candidate;
    }
  }

  if (lastAssistantText) {
    text = lastAssistantText;
  }

  return { text, tokenUsage };
}

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
    const args = ['exec', ...(options.extraArgs ?? [])];
    if (options.mcpConfigPath) {
      try {
        const overrides = codexMcpConfigOverridesFromPath(options.mcpConfigPath);
        for (const override of overrides) {
          args.push('-c', override);
        }
      } catch {
        // Best-effort fallback: if MCP config cannot be converted, continue without MCP overrides.
      }
    }
    args.push('--json', '--ephemeral', fullPrompt);

    return new Promise<ExecutionResult>((resolve, reject) => {
      const baseSpawnOpts = codexSpawnBaseOptions();
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
        const parsed = parseCodexJsonlOutput(stdout);
        const text = parsed.text;
        const tokenUsage = parsed.tokenUsage;

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
