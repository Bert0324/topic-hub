import { loadAdminToken, loadIdToken } from '../auth/auth.js';
import { loadConfigOrNull } from '../config/config.js';
import { postNativeGateway } from './native-gateway.js';

/** Strip trailing slashes so `${base}${path}` never produces `//` when path starts with `/`. */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export class ApiClient {
  readonly baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string, token?: string) {
    const config = baseUrl ? null : loadConfigOrNull();
    const raw =
      baseUrl ??
      config?.serverUrl ??
      'http://localhost:3000';
    this.baseUrl = normalizeBaseUrl(raw);
    if (token) this.token = token;
  }

  setToken(token: string) {
    this.token = token;
  }

  async ensureAuth(): Promise<void> {
    if (this.token) return;
    const admin = await loadAdminToken();
    if (admin) {
      this.token = admin;
      return;
    }
    const id = await loadIdToken();
    if (id) {
      this.token = id;
    }
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options?: { auth?: boolean },
  ): Promise<T> {
    const withAuth = options?.auth !== false;
    if (withAuth) {
      await this.ensureAuth();
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withAuth && this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ message: res.statusText }))) as {
        message?: string;
      };
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  get<T = unknown>(path: string, options?: { auth?: boolean }) {
    return this.request<T>('GET', path, undefined, options);
  }
  post<T = unknown>(path: string, body?: unknown, options?: { auth?: boolean }) {
    return this.request<T>('POST', path, body, options);
  }
  patch<T = unknown>(path: string, body?: unknown, options?: { auth?: boolean }) {
    return this.request<T>('PATCH', path, body, options);
  }
  delete<T = unknown>(path: string, options?: { auth?: boolean }) {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async publishSkills(payload: { skills: unknown[] }): Promise<unknown> {
    await this.ensureAuth();
    return postNativeGateway(this.baseUrl, 'admin.skills.publish', payload as Record<string, unknown>, {
      authorization: this.token!,
    });
  }

  /** Authenticated native gateway (`POST /topic-hub`). */
  async nativeGateway<T = unknown>(
    op: string,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    await this.ensureAuth();
    return postNativeGateway<T>(this.baseUrl, op, payload, { authorization: this.token! });
  }

  /** Gateway call without Bearer (e.g. public skill catalog). */
  async nativeGatewayPublic<T = unknown>(
    op: string,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    return postNativeGateway<T>(this.baseUrl, op, payload, {});
  }

  async createGroup(payload: { name: string; platform: string; memberIds: string[]; topicType?: string }): Promise<unknown> {
    return this.post('/admin/groups', payload);
  }

  /** Executor-only: returns dispatch id/status/topic when the bearer matches `targetExecutorToken`. */
  getDispatchForExecutor(id: string): Promise<{ id: string; status: string; topicId: string }> {
    return this.nativeGateway('dispatches.get', { id });
  }
}
