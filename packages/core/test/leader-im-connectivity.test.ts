import { TopicHubError } from '../src/common/errors';
import { assertLeaderImConnectivityChecks } from '../src/bridge/leader-im-connectivity';

describe('assertLeaderImConnectivityChecks', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('skips when checks is undefined', async () => {
    globalThis.fetch = jest.fn() as typeof fetch;
    await assertLeaderImConnectivityChecks(undefined, { feishu: { appId: 'x', appSecret: 'y' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips when checks is empty array', async () => {
    globalThis.fetch = jest.fn() as typeof fetch;
    await assertLeaderImConnectivityChecks([], { feishu: { appId: 'x', appSecret: 'y' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws TopicHubError when feishu is required but not configured', async () => {
    await expect(
      assertLeaderImConnectivityChecks(['feishu'], { discord: { botToken: 't' } } as any),
    ).rejects.toThrow(TopicHubError);
  });

  it('dedupes platforms and calls Feishu token API once for duplicate entries', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'tok', msg: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assertLeaderImConnectivityChecks(['feishu', 'feishu'], {
      feishu: { appId: 'cli_x', appSecret: 'sec' },
    });
    expect(calls).toBe(1);
  });
});
