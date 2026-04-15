import { pickImNotifyBody } from '../src/im/im-notify-body';

describe('FR-014 legibility in IM notify body', () => {
  it('preserves leading *(agent #N)* line in short completion text', () => {
    const text = '*(agent #2)*\n\nHello from the agent.';
    const body = pickImNotifyBody(text, undefined, 500);
    expect(body).toContain('agent #2');
    expect(body).toContain('Hello');
  });
});
