import {
  getCredential,
  setCredential,
  isExpired,
  type AdapterCredential,
} from './credential-store.js';

interface AdapterAuthConfig {
  type: 'oauth2' | 'api_key' | 'none';
  scopes?: string[];
}

export async function ensureAuthenticated(
  adapterName: string,
  userId: string,
  authConfig: AdapterAuthConfig,
): Promise<AdapterCredential | null> {
  if (authConfig.type === 'none') return null;

  const existing = await getCredential(adapterName, userId);
  if (existing && !isExpired(existing)) {
    return existing;
  }

  if (existing && existing.refreshToken && isExpired(existing)) {
    console.log(
      `Credentials for ${adapterName} expired. Re-authentication required.`,
    );
  }

  if (authConfig.type === 'api_key') {
    const { input } = await import('@inquirer/prompts');
    const token = await input({
      message: `Enter API key for ${adapterName}:`,
    });

    const credential: AdapterCredential = {
      adapterName,
      userId,
      tokenType: 'api_key',
      accessToken: token,
      refreshToken: null,
      expiresAt: null,
    };
    await setCredential(credential);
    console.log(`✓ Saved credentials for ${adapterName}`);
    return credential;
  }

  if (authConfig.type === 'oauth2') {
    const { input } = await import('@inquirer/prompts');
    console.log(`OAuth2 authentication required for ${adapterName}`);
    if (authConfig.scopes?.length) {
      console.log(`Required scopes: ${authConfig.scopes.join(', ')}`);
    }
    const token = await input({
      message: `Enter access token for ${adapterName}:`,
    });

    const credential: AdapterCredential = {
      adapterName,
      userId,
      tokenType: 'oauth2',
      accessToken: token,
      refreshToken: null,
      expiresAt: null,
    };
    await setCredential(credential);
    console.log(`✓ Saved credentials for ${adapterName}`);
    return credential;
  }

  return null;
}
