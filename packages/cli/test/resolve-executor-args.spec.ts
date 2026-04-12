/// <reference types="jest" />

import {
  argvHasClaudePermissionMode,
  argvHasCodexUnattendedFlags,
} from '../src/executors/executor-launch-arg-guards';

describe('argvHasClaudePermissionMode', () => {
  it('detects --permission-mode value form', () => {
    expect(argvHasClaudePermissionMode(['--permission-mode', 'plan'])).toBe(true);
  });
  it('detects equals form', () => {
    expect(argvHasClaudePermissionMode(['--permission-mode=acceptEdits'])).toBe(true);
  });
  it('false when absent', () => {
    expect(argvHasClaudePermissionMode(['--verbose'])).toBe(false);
  });
});

describe('argvHasCodexUnattendedFlags', () => {
  it('detects --full-auto', () => {
    expect(argvHasCodexUnattendedFlags(['--full-auto'])).toBe(true);
  });
  it('detects --sandbox pair', () => {
    expect(argvHasCodexUnattendedFlags(['--sandbox', 'read-only'])).toBe(true);
  });
  it('detects danger flag', () => {
    expect(argvHasCodexUnattendedFlags(['--dangerously-bypass-approvals-and-sandbox'])).toBe(
      true,
    );
  });
  it('false when absent', () => {
    expect(argvHasCodexUnattendedFlags(['--json'])).toBe(false);
  });
});
