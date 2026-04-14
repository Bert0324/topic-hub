/**
 * Pre-flight check before this process becomes embedded OpenClaw **lease leader** with Feishu enabled.
 * Uses the official tenant_access_token internal API (same credentials as the Feishu channel plugin).
 */
export type FeishuBridgeCredentials = {
  appId: string;
  appSecret: string;
  domain?: 'feishu' | 'lark';
};

const TOKEN_PATH = '/open-apis/auth/v3/tenant_access_token/internal';

function tenantTokenUrl(domain: FeishuBridgeCredentials['domain']): string {
  if (domain === 'lark') {
    return `https://open.larksuite.com${TOKEN_PATH}`;
  }
  return `https://open.feishu.cn${TOKEN_PATH}`;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * @throws Error when HTTP/network fails or Feishu returns non-zero code / missing token
 */
export async function assertFeishuBridgeReachable(
  cfg: FeishuBridgeCredentials,
  opts?: { timeoutMs?: number },
): Promise<void> {
  const url = tenantTokenUrl(cfg.domain);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: { code?: number; msg?: string; tenant_access_token?: string };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${body.msg ?? text.slice(0, 200)}`);
    }
    if (body.code !== 0) {
      throw new Error(body.msg ?? `Feishu API code ${String(body.code)}`);
    }
    if (!body.tenant_access_token || typeof body.tenant_access_token !== 'string') {
      throw new Error('Feishu API succeeded but tenant_access_token missing');
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Feishu/Lark token request timed out after ${timeoutMs}ms (url=${url})`);
    }
    const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
    const causeMsg = cause instanceof Error ? `: ${cause.message}` : '';
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Feishu/Lark connectivity check failed (url=${url}): ${msg}${causeMsg}`);
  } finally {
    clearTimeout(timer);
  }
}
