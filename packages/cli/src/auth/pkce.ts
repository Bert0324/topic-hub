import * as crypto from 'crypto';
import * as http from 'http';
import { URL } from 'url';

export interface PkceTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export interface PkceConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export function buildAuthorizeUrl(config: PkceConfig, codeChallenge: string, state: string): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function startCallbackServer(port: number): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '', `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>You can close this window.</p>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code && state) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');
        server.close();
        resolve({ code, state });
      }
    });

    server.listen(port, '127.0.0.1');
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timeout (60s)'));
    }, 60000);
  });
}

export async function exchangeCodeForTokens(
  tokenUrl: string,
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
): Promise<PkceTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const refreshToken =
    data.refresh_token != null && data.refresh_token !== ''
      ? String(data.refresh_token)
      : undefined;
  const expiresRaw = data.expires_in;
  const expiresIn =
    typeof expiresRaw === 'number'
      ? expiresRaw
      : typeof expiresRaw === 'string'
        ? parseInt(expiresRaw, 10)
        : undefined;
  return {
    idToken: String(data.id_token ?? ''),
    accessToken: String(data.access_token ?? ''),
    refreshToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
  };
}
