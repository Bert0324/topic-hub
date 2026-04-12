/// <reference types="jest" />

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  expandUserPath,
  normalizeAgentCwd,
  resolveAgentWorkingDir,
  resolveServeInvocationDirectory,
} from '../src/commands/serve/resolve-agent-cwd';

describe('expandUserPath', () => {
  const home = process.env.HOME ?? '/tmp';

  it('expands ~/suffix', () => {
    expect(expandUserPath('~/foo')).toBe(path.join(home, 'foo'));
  });

  it('returns plain paths unchanged', () => {
    expect(expandUserPath('/abs/x')).toBe('/abs/x');
  });
});

describe('normalizeAgentCwd', () => {
  it('returns absolute path for existing directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-agent-cwd-'));
    const got = normalizeAgentCwd(dir);
    expect(got).toBe(path.resolve(dir));
    fs.rmSync(dir, { recursive: true });
  });

  it('returns undefined for missing path', () => {
    expect(normalizeAgentCwd('/nonexistent-dir-xyz-12345')).toBeUndefined();
  });

  it('returns undefined for file path', () => {
    const f = path.join(os.tmpdir(), `th-agent-cwd-file-${Date.now()}`);
    fs.writeFileSync(f, 'x', 'utf-8');
    expect(normalizeAgentCwd(f)).toBeUndefined();
    fs.unlinkSync(f);
  });
});

describe('resolveServeInvocationDirectory', () => {
  const prevInit = process.env.INIT_CWD;

  afterEach(() => {
    if (prevInit === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = prevInit;
  });

  it('prefers INIT_CWD when it is an existing directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-init-cwd-'));
    process.env.INIT_CWD = dir;
    expect(resolveServeInvocationDirectory()).toBe(path.resolve(dir));
    fs.rmSync(dir, { recursive: true });
  });

  it('falls back to process.cwd() when INIT_CWD is unset or not a directory', () => {
    delete process.env.INIT_CWD;
    expect(resolveServeInvocationDirectory()).toBe(path.resolve(process.cwd()));
    process.env.INIT_CWD = '/nonexistent-init-cwd-xyz-999';
    expect(resolveServeInvocationDirectory()).toBe(path.resolve(process.cwd()));
  });
});

describe('resolveAgentWorkingDir', () => {
  const prevInit = process.env.INIT_CWD;

  afterEach(() => {
    if (prevInit === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = prevInit;
  });

  it('prefers topic.metadata.executorCwd when valid', () => {
    const topicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-topic-'));
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-session-'));
    expect(
      resolveAgentWorkingDir({
        topicMetadata: { executorCwd: topicDir },
        sessionDefaultCwd: sessionDir,
      }),
    ).toEqual({ cwd: path.resolve(topicDir), source: 'topic' });
    fs.rmSync(topicDir, { recursive: true });
    fs.rmSync(sessionDir, { recursive: true });
  });

  it('falls back to session when topic executorCwd invalid', () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-session-'));
    const r = resolveAgentWorkingDir({
      topicMetadata: { executorCwd: '/no-such-dir-999' },
      sessionDefaultCwd: sessionDir,
    });
    expect(r.cwd).toBe(path.resolve(sessionDir));
    expect(r.source).toBe('session');
    expect(r.topicExecutorCwdInvalid).toBe(true);
    fs.rmSync(sessionDir, { recursive: true });
  });

  it('uses session when topic has no executorCwd', () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-session-'));
    expect(
      resolveAgentWorkingDir({
        topicMetadata: {},
        sessionDefaultCwd: sessionDir,
      }).cwd,
    ).toBe(path.resolve(sessionDir));
    fs.rmSync(sessionDir, { recursive: true });
  });

  it('defaults to process.cwd() when no topic override and no session and INIT_CWD unset', () => {
    delete process.env.INIT_CWD;
    const r = resolveAgentWorkingDir({
      topicMetadata: {},
      sessionDefaultCwd: undefined,
    });
    expect(r.cwd).toBe(path.resolve(process.cwd()));
    expect(r.source).toBe('pwd');
  });

  it('defaults to INIT_CWD when no topic override and no session', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-invoke-'));
    process.env.INIT_CWD = dir;
    const r = resolveAgentWorkingDir({
      topicMetadata: {},
      sessionDefaultCwd: undefined,
    });
    expect(r.cwd).toBe(path.resolve(dir));
    expect(r.source).toBe('pwd');
    fs.rmSync(dir, { recursive: true });
  });

  it('falls back to process.cwd() when topic executorCwd invalid and no session and INIT_CWD unset', () => {
    delete process.env.INIT_CWD;
    const r = resolveAgentWorkingDir({
      topicMetadata: { executorCwd: '/no-such-dir-999' },
      sessionDefaultCwd: undefined,
    });
    expect(r.cwd).toBe(path.resolve(process.cwd()));
    expect(r.source).toBe('pwd');
    expect(r.topicExecutorCwdInvalid).toBe(true);
  });
});
