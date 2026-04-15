import * as keytar from 'keytar';

const SERVICE_NAME = 'topichub-adapter';

export interface AdapterCredential {
  adapterName: string;
  userId: string;
  tokenType: 'oauth2' | 'api_key' | 'bearer';
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export function isExpired(credential: AdapterCredential): boolean {
  if (!credential.expiresAt) return false;
  return Date.now() > credential.expiresAt;
}

export async function getCredential(
  adapterName: string,
  userId: string,
): Promise<AdapterCredential | null> {
  try {
    const key = `${adapterName}:${userId}`;
    const raw = await keytar.getPassword(SERVICE_NAME, key);
    if (!raw) return null;
    return JSON.parse(raw) as AdapterCredential;
  } catch {
    return null;
  }
}

export async function setCredential(credential: AdapterCredential): Promise<void> {
  const key = `${credential.adapterName}:${credential.userId}`;
  await keytar.setPassword(SERVICE_NAME, key, JSON.stringify(credential));
}

export async function deleteCredential(
  adapterName: string,
  userId: string,
): Promise<void> {
  const key = `${adapterName}:${userId}`;
  await keytar.deletePassword(SERVICE_NAME, key);
}
