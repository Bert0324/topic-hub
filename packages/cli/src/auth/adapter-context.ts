import { ensureAuthenticated } from './adapter-auth-flow.js';
import { getCredential, deleteCredential } from './credential-store.js';

export interface AdapterContext {
  ensureAuth: (authConfig: {
    type: 'oauth2' | 'api_key' | 'none';
    scopes?: string[];
  }) => Promise<{ accessToken: string } | null>;
  getStoredCredential: () => Promise<{ accessToken: string } | null>;
  clearCredential: () => Promise<void>;
}

export function createAdapterContext(
  adapterName: string,
  userId: string,
): AdapterContext {
  return {
    ensureAuth: async (authConfig) => {
      const cred = await ensureAuthenticated(adapterName, userId, authConfig);
      return cred ? { accessToken: cred.accessToken } : null;
    },
    getStoredCredential: async () => {
      const cred = await getCredential(adapterName, userId);
      return cred ? { accessToken: cred.accessToken } : null;
    },
    clearCredential: async () => {
      await deleteCredential(adapterName, userId);
    },
  };
}
