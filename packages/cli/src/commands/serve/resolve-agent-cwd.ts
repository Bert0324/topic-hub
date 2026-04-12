import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Expands a leading `~` using $HOME (same idea as shell tilde).
 */
export function expandUserPath(p: string): string {
  const t = p.trim();
  if (!t) return t;
  if (t.startsWith('~/')) {
    return path.join(process.env.HOME ?? '', t.slice(2));
  }
  if (t === '~') {
    return process.env.HOME ?? t;
  }
  return t;
}

/**
 * Returns an absolute directory path if `raw` points at an existing directory; otherwise `undefined`.
 */
export function normalizeAgentCwd(raw: string | undefined | null): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  const expanded = expandUserPath(raw);
  if (!expanded) return undefined;
  const resolved = path.resolve(expanded);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    // ignore fs errors
  }
  return undefined;
}

export type AgentCwdSource = 'topic' | 'session' | 'pwd' | 'none';

export interface ResolveAgentWorkingDirResult {
  cwd: string | undefined;
  source: AgentCwdSource;
  /** Topic had `executorCwd` set but it was missing or not a directory. */
  topicExecutorCwdInvalid?: boolean;
}

/**
 * Directory the user invoked the package-manager / CLI from — often **not** the same as
 * `process.cwd()` under `pnpm run` / `npm run` (those typically chdir to the package folder).
 *
 * npm and pnpm set **`INIT_CWD`** to the shell’s cwd when the script was started; we prefer that
 * so agent subprocess cwd matches “where I ran the command”. Falls back to `process.cwd()`
 * when `INIT_CWD` is unset or not a directory (e.g. raw `tsx` without a package manager).
 */
export function resolveServeInvocationDirectory(): string | undefined {
  const fromInit = normalizeAgentCwd(process.env.INIT_CWD);
  if (fromInit) return fromInit;
  return normalizeAgentCwd(process.cwd());
}

/**
 * Per-dispatch cwd for local agent subprocesses (Claude Code, Codex, or future AgentExecutor types).
 *
 * Precedence: `topic.metadata.executorCwd` (if valid directory) → session override
 * (`TOPICHUB_AGENT_CWD` / `serve --agent-cwd`) → **`INIT_CWD` or `process.cwd()`**
 * (see {@link resolveServeInvocationDirectory}).
 */
export function resolveAgentWorkingDir(params: {
  topicMetadata?: Record<string, unknown> | null;
  sessionDefaultCwd?: string | null;
}): ResolveAgentWorkingDirResult {
  const topicRaw = params.topicMetadata?.executorCwd;
  if (typeof topicRaw === 'string' && topicRaw.trim()) {
    const fromTopic = normalizeAgentCwd(topicRaw);
    if (fromTopic) {
      return { cwd: fromTopic, source: 'topic' };
    }
    const fallback = normalizeAgentCwd(
      typeof params.sessionDefaultCwd === 'string' ? params.sessionDefaultCwd : undefined,
    );
    if (fallback) {
      return { cwd: fallback, source: 'session', topicExecutorCwdInvalid: true };
    }
    const pwd = resolveServeInvocationDirectory();
    if (pwd) {
      return { cwd: pwd, source: 'pwd', topicExecutorCwdInvalid: true };
    }
    return { cwd: undefined, source: 'none', topicExecutorCwdInvalid: true };
  }

  const fromSession = normalizeAgentCwd(
    typeof params.sessionDefaultCwd === 'string' ? params.sessionDefaultCwd : undefined,
  );
  if (fromSession) {
    return { cwd: fromSession, source: 'session' };
  }
  const pwd = resolveServeInvocationDirectory();
  if (pwd) {
    return { cwd: pwd, source: 'pwd' };
  }
  return { cwd: undefined, source: 'none' };
}
