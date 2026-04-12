import { NATIVE_INTEGRATION_SEGMENT } from '@topichub/core';

/**
 * Collapse `…/topic-hub` to deployment root so `POST {root}/topic-hub` is never doubled.
 * Accepts users who paste the gateway path as the "server URL".
 */
export function normalizeTopicHubServerRoot(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  const tail = `/${NATIVE_INTEGRATION_SEGMENT}`;
  const tailLo = tail.toLowerCase();
  while (s.length > 0) {
    const lo = s.toLowerCase();
    if (!lo.endsWith(tailLo)) break;
    s = s.slice(0, -tail.length).replace(/\/+$/, '');
  }
  return s;
}

export type PostNativeGatewayOptions = {
  /** `Bearer …` value or full `Bearer …` string — if value has no "Bearer " prefix it is added. */
  authorization?: string;
  signal?: AbortSignal;
};

function normalizeAuthHeader(raw: string): string {
  const t = raw.trim();
  return t.toLowerCase().startsWith('bearer ') ? t : `Bearer ${t}`;
}

/**
 * POST to the single native integration ingress (`/{segment}` under optional global prefix).
 */
export async function postNativeGateway<T = unknown>(
  baseUrl: string,
  op: string,
  payload: Record<string, unknown> = {},
  options?: PostNativeGatewayOptions,
): Promise<T> {
  const root = normalizeTopicHubServerRoot(baseUrl);
  const url = `${root}/${NATIVE_INTEGRATION_SEGMENT}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.authorization) {
    headers.Authorization = normalizeAuthHeader(options.authorization);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ v: 1, op, payload }),
    signal: options?.signal,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText;
    throw new Error(`HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  if (json.ok === false) {
    throw new Error(json.error?.message ?? 'Gateway error');
  }
  return json.data as T;
}
