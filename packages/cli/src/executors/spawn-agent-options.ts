import type { SpawnOptions } from 'node:child_process';
import type { ExecutorOptions } from './executor.interface.js';

/**
 * Merge {@link ExecutorOptions.cwd} into spawn options for any local agent CLI.
 * New executors should use this so cwd behavior stays consistent.
 */
export function spawnOptionsWithExecutorCwd(
  base: SpawnOptions,
  options: Pick<ExecutorOptions, 'cwd'>,
): SpawnOptions {
  if (!options.cwd) return base;
  return { ...base, cwd: options.cwd };
}
