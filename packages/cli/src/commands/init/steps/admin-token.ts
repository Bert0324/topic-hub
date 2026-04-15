import { password } from '@inquirer/prompts';
import {
  saveIdentityToken,
  loadIdentityToken,
  loadAdminToken,
} from '../../../auth/auth.js';
import { postNativeGateway } from '../../../api-client/native-gateway.js';

export async function promptAdminToken(serverUrl: string): Promise<string | null> {
  const existingIdentity = await loadIdentityToken();
  const existingAdmin = await loadAdminToken();
  const hasExisting = existingIdentity !== null || existingAdmin !== null;

  const token = await password({
    message: hasExisting
      ? 'Identity/Admin token (optional, press Enter to keep current)'
      : 'Identity/Admin token (optional, press Enter to skip)',
    mask: '*',
    validate: (val) => {
      if (!val) return true;
      if (val.length < 10) return 'Token seems too short';
      return true;
    },
  });

  const tokenToUse = token.trim();
  if (!tokenToUse) {
    if (hasExisting) {
      console.log('  ✓ Keeping existing saved token');
      return existingIdentity ?? existingAdmin;
    }
    console.log('  ✓ Skipped token setup');
    return null;
  }

  process.stdout.write('  Validating token... ');
  try {
    await postNativeGateway(
      serverUrl,
      'identity.me',
      {},
      { authorization: tokenToUse, signal: AbortSignal.timeout(5000) },
    );
    console.log('✓ Token valid');
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Token validation failed: ${msg}`);
  }

  await saveIdentityToken(tokenToUse);
  return tokenToUse;
}
