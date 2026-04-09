import { storeToken, getToken, deleteToken } from './keychain.js';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizeUrl,
  startCallbackServer,
  exchangeCodeForTokens,
  PkceConfig,
} from './pkce.js';
import * as crypto from 'crypto';

const CALLBACK_PORT = 18921;
const ID_TOKEN_ACCOUNT = 'id_token';
const ACCESS_TOKEN_ACCOUNT = 'access_token';
const ADMIN_TOKEN_ACCOUNT = 'admin_token';

export async function saveAdminToken(token: string): Promise<void> {
  await storeToken(ADMIN_TOKEN_ACCOUNT, token);
}

export async function loadAdminToken(): Promise<string | null> {
  return getToken(ADMIN_TOKEN_ACCOUNT);
}

export async function loadIdToken(): Promise<string | null> {
  return getToken(ID_TOKEN_ACCOUNT);
}

export async function clearAllTokens(): Promise<void> {
  await deleteToken(ID_TOKEN_ACCOUNT);
  await deleteToken(ACCESS_TOKEN_ACCOUNT);
  await deleteToken(ADMIN_TOKEN_ACCOUNT);
}

export async function login(pkceConfig: PkceConfig): Promise<{
  idToken: string;
  displayName: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
  const config = { ...pkceConfig, redirectUri };

  const authorizeUrl = buildAuthorizeUrl(config, codeChallenge, state);

  console.log('Opening browser for authentication...');

  const open = (await import('open')).default;
  await open(authorizeUrl);

  console.log('Waiting for authorization...');
  const { code, state: returnedState } = await startCallbackServer(CALLBACK_PORT);

  if (returnedState !== state) {
    throw new Error('State mismatch — possible CSRF attack');
  }

  const tokens = await exchangeCodeForTokens(
    config.tokenUrl,
    code,
    codeVerifier,
    config.clientId,
    redirectUri,
  );

  await storeToken(ID_TOKEN_ACCOUNT, tokens.idToken);
  await storeToken(ACCESS_TOKEN_ACCOUNT, tokens.accessToken);

  const payload = JSON.parse(
    Buffer.from(tokens.idToken.split('.')[1], 'base64url').toString(),
  );

  return {
    idToken: tokens.idToken,
    displayName: payload.name ?? payload.preferred_username ?? payload.sub ?? 'user',
  };
}
