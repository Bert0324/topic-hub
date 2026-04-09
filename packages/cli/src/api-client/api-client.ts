import { loadAdminToken, loadIdToken } from '../auth/auth.js';

export class ApiClient {
  readonly baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.TOPICHUB_SERVER_URL ?? 'http://localhost:3000';
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

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureAuth();

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

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

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }
}
