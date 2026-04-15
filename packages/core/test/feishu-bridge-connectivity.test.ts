import { assertFeishuBridgeReachable } from '../src/bridge/feishu-bridge-connectivity';

describe('assertFeishuBridgeReachable', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('POSTs to Feishu when domain is feishu or omitted', async () => {
    const urls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 't-x', msg: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assertFeishuBridgeReachable({ appId: 'cli_x', appSecret: 'sec' });
    expect(urls[0]).toBe('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      urls[0],
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ app_id: 'cli_x', app_secret: 'sec' }),
      }),
    );
  });

  it('POSTs to Lark when domain is lark', async () => {
    const urls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 't-y', msg: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assertFeishuBridgeReachable({ appId: 'a', appSecret: 'b', domain: 'lark' });
    expect(urls[0]).toBe('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal');
  });

  it('throws when Feishu returns non-zero code', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ code: 10010, msg: 'invalid app' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await expect(assertFeishuBridgeReachable({ appId: 'x', appSecret: 'y' })).rejects.toThrow('invalid app');
  });
});
