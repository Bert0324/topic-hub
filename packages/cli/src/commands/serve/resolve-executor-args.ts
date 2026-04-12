import { confirm, select } from '@inquirer/prompts';
import {
  argvHasClaudePermissionMode,
  argvHasCodexUnattendedFlags,
} from '../../executors/executor-launch-arg-guards.js';

export {
  argvHasClaudePermissionMode,
  argvHasCodexUnattendedFlags,
} from '../../executors/executor-launch-arg-guards.js';

export interface ResolveServeExecutorArgsOptions {
  /** Accept defaults without prompts (also when stdin is not a TTY or CI=1). */
  skipPrompts?: boolean;
}

/**
 * Before `serve` attaches to SSE, resolve extra argv for the agent CLI so headless runs do not
 * block on approvals. Interactive when stdin is a TTY unless `skipPrompts` / CI / non-TTY.
 */
export async function resolveServeExecutorArgs(
  executor: string,
  configArgs: string[] | undefined,
  opts: ResolveServeExecutorArgsOptions = {},
): Promise<string[] | undefined> {
  const nonInteractive =
    opts.skipPrompts === true
    || process.env.CI === 'true'
    || process.stdin.isTTY !== true;

  const base = [...(configArgs ?? [])];

  if (executor === 'none') {
    return configArgs?.length ? [...configArgs] : undefined;
  }

  if (executor === 'claude-code') {
    if (argvHasClaudePermissionMode(base)) {
      return base.length ? base : undefined;
    }

    if (!nonInteractive) {
      const useBypass = await confirm({
        message:
          'Claude Code has no TTY under serve. Add --permission-mode bypassPermissions so dispatches do not block on tool approvals? (Recommended.)',
        default: true,
      });
      if (useBypass) {
        base.push('--permission-mode', 'bypassPermissions');
      } else {
        const mode = await select({
          message: 'Choose Claude Code permission mode for this session:',
          choices: [
            {
              name: 'bypassPermissions — allow tools without prompting',
              value: 'bypassPermissions',
            },
            { name: 'acceptEdits — conservative', value: 'acceptEdits' },
            { name: 'plan', value: 'plan' },
            { name: 'dontAsk', value: 'dontAsk' },
            { name: 'default', value: 'default' },
            { name: 'auto', value: 'auto' },
          ],
          default: 'bypassPermissions',
        });
        base.push('--permission-mode', mode);
      }
    } else {
      const mode = process.env.TOPICHUB_CLAUDE_PERMISSION_MODE?.trim() || 'bypassPermissions';
      base.push('--permission-mode', mode);
    }

    return base.length ? base : undefined;
  }

  if (executor === 'codex') {
    if (argvHasCodexUnattendedFlags(base)) {
      return base.length ? base : undefined;
    }

    if (!nonInteractive) {
      const choice = await select({
        message:
          'Codex runs headless under serve. How should model-invoked shell commands be sandboxed?',
        choices: [
          {
            name: 'danger — bypass approvals and sandbox (trusted machine only, recommended)',
            value: 'danger',
          },
          {
            name: 'full-auto — workspace write, lower friction (recommended)',
            value: 'full-auto',
          },
          { name: 'workspace-write — explicit sandbox', value: 'workspace-write' },
          { name: 'read-only sandbox', value: 'read-only' },
        ],
        default: 'danger',
      });
      if (choice === 'full-auto') base.push('--full-auto');
      else if (choice === 'workspace-write') base.push('--sandbox', 'workspace-write');
      else if (choice === 'read-only') base.push('--sandbox', 'read-only');
      else base.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      base.push('--dangerously-bypass-approvals-and-sandbox');
    }

    return base.length ? base : undefined;
  }

  return configArgs?.length ? [...configArgs] : undefined;
}
