/// <reference types="jest" />

import { spawnOptionsWithExecutorCwd } from '../src/executors/spawn-agent-options';

describe('spawnOptionsWithExecutorCwd', () => {
  it('adds cwd when set', () => {
    const out = spawnOptionsWithExecutorCwd({ stdio: 'pipe' }, { cwd: '/tmp/myproject' });
    expect(out).toEqual({ stdio: 'pipe', cwd: '/tmp/myproject' });
  });

  it('leaves options unchanged when cwd absent', () => {
    const base = { stdio: 'pipe' as const, timeout: 1 };
    expect(spawnOptionsWithExecutorCwd(base, {})).toEqual(base);
  });
});
