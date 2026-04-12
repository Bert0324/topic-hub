import { spawn } from 'child_process';
import type { AgentExecutor, ExecutionResult, ExecutorOptions } from './executor.interface.js';
import { spawnOptionsWithExecutorCwd } from './spawn-agent-options.js';
import { argvHasClaudePermissionMode } from './executor-launch-arg-guards.js';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function pickTokenUsage(obj: Record<string, unknown>): { input: number; output: number } | undefined {
  const u = obj.usage as Record<string, unknown> | undefined;
  if (!u) return undefined;
  return {
    input: Number(u.input_tokens ?? u.inputTokens ?? 0),
    output: Number(u.output_tokens ?? u.outputTokens ?? 0),
  };
}

/** Pull plain text from assistant `message.content` blocks (Anthropic-style). */
function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
    } else if (block && typeof block === 'object' && 'text' in block) {
      const t = (block as { text?: unknown }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('');
}

/**
 * `claude -p … --output-format json` normally prints one object with `.result`.
 * With `--verbose`, stdout is often a JSON **array** of stream events (`system/init`, tools, …) and
 * `.result` is missing on the root — we must walk events instead of dumping raw JSON to Topic Hub.
 */
function extractClaudePrintOutput(stdout: string): {
  text: string;
  tokenUsage?: { input: number; output: number };
} {
  const trimmed = stdout.trim();
  if (!trimmed) return { text: '' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { text: stdout };
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    const usage = pickTokenUsage(o);
    if (typeof o.result === 'string') {
      return { text: o.result, tokenUsage: usage };
    }
    const fallback =
      (typeof o.content === 'string' ? o.content : '')
      || (typeof o.text === 'string' ? o.text : '');
    return { text: fallback, tokenUsage: usage };
  }

  const events = Array.isArray(parsed) ? parsed : null;
  if (!events) return { text: stdout };

  let lastResultText = '';
  const assistantChunks: string[] = [];
  let lastUsage: { input: number; output: number } | undefined;

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const o = ev as Record<string, unknown>;
    const u = pickTokenUsage(o);
    if (u) lastUsage = u;

    if (o.type === 'result' && typeof o.result === 'string' && o.result.trim()) {
      lastResultText = o.result;
    }

    if (o.type === 'assistant') {
      const msg = o.message as Record<string, unknown> | undefined;
      if (msg?.content != null) {
        const chunk = stringifyMessageContent(msg.content);
        if (chunk) assistantChunks.push(chunk);
      }
    }

    if (o.type === 'message' && o.role === 'assistant' && o.content != null) {
      const chunk = stringifyMessageContent(o.content);
      if (chunk) assistantChunks.push(chunk);
    }
  }

  const fromAssistant = assistantChunks.join('\n').trim();
  if (lastResultText.trim()) return { text: lastResultText.trim(), tokenUsage: lastUsage };
  if (fromAssistant) return { text: fromAssistant, tokenUsage: lastUsage };

  return {
    text: '[No assistant text parsed from Claude Code JSON; try `TOPICHUB_CLAUDE_VERBOSE=0` or upgrade `claude` CLI.]',
    tokenUsage: lastUsage,
  };
}

export class ClaudeCodeExecutor implements AgentExecutor {
  readonly type = 'claude-code';

  async execute(
    prompt: string,
    systemPromptPath: string | null,
    options: ExecutorOptions = {},
  ): Promise<ExecutionResult> {
    const timeoutMs =
      options.timeoutMs !== undefined ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    const args: string[] = [];

    if (options.extraArgs?.length) {
      args.push(...options.extraArgs);
    }

    // `serve` has no TTY; Claude Code otherwise waits on permission prompts → stuck RUN.
    // Default headless mode to bypassPermissions so IM/dispatch agents can use Bash (e.g. curl),
    // MCP, etc. without manual env. Tighten with TOPICHUB_CLAUDE_PERMISSION_MODE=acceptEdits or
    // pass --permission-mode in executorArgs.
    if (
      options.headless
      && process.env.TOPICHUB_CLAUDE_HEADLESS !== '0'
      && !argvHasClaudePermissionMode(args)
    ) {
      const mode =
        process.env.TOPICHUB_CLAUDE_PERMISSION_MODE?.trim() || 'bypassPermissions';
      args.push('--permission-mode', mode);
    }

    args.push('-p', prompt, '--output-format', 'json');
    // `--verbose` emits a JSON *array* of stream events; programmatic callers expect a single object + `.result`.
    if (process.env.TOPICHUB_CLAUDE_VERBOSE === '1') {
      args.push('--verbose');
    }

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
      const baseSpawnOpts: import('child_process').SpawnOptions = {
        stdio: options.headless ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
      };
      const spawnOpts = spawnOptionsWithExecutorCwd(baseSpawnOpts, options);
      if (timeoutMs > 0) {
        spawnOpts.timeout = timeoutMs;
      }
      const child = spawn('claude', args, spawnOpts);

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

        const extracted = extractClaudePrintOutput(stdout);
        let text = extracted.text;
        let tokenUsage = extracted.tokenUsage;

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
