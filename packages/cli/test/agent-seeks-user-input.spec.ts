/// <reference types="jest" />

import { agentOutputSeeksImAnswer } from '../src/commands/serve/agent-seeks-user-input';

describe('agentOutputSeeksImAnswer', () => {
  const prev = process.env.TOPICHUB_DISABLE_INTERACTIVE_QA;

  afterEach(() => {
    if (prev === undefined) delete process.env.TOPICHUB_DISABLE_INTERACTIVE_QA;
    else process.env.TOPICHUB_DISABLE_INTERACTIVE_QA = prev;
  });

  it('is true for speckit-style Question N of M', () => {
    expect(
      agentOutputSeeksImAnswer('## Extension Hooks\n\nQuestion 1 of 5\nPick A or B.'),
    ).toBe(true);
  });

  it('is true for TOPICHUB_QA_PENDING sentinel', () => {
    expect(agentOutputSeeksImAnswer('Please decide.\nTOPICHUB_QA_PENDING\n')).toBe(true);
  });

  it('is false for plain completion', () => {
    expect(agentOutputSeeksImAnswer('Task done. Here is the file tree.')).toBe(false);
  });

  it('is false when disabled by env', () => {
    process.env.TOPICHUB_DISABLE_INTERACTIVE_QA = '1';
    expect(agentOutputSeeksImAnswer('Question 1 of 5')).toBe(false);
  });
});
