import { password } from '@inquirer/prompts';
import { saveAdminToken, loadAdminToken } from '../../../auth/auth.js';
import { postNativeGateway } from '../../../api-client/native-gateway.js';

async function tryBootstrap(serverUrl: string): Promise<string | null> {
  try {
    const data = await postNativeGateway<{ superadminToken?: string }>(
      serverUrl,
      'system.init',
      {},
      { signal: AbortSignal.timeout(5000) },
    );
    return data.superadminToken ?? null;
  } catch {
    return null;
  }
}

export async function promptAdminToken(serverUrl: string): Promise<string> {
  const existing = await loadAdminToken();

  const bootstrapToken = await tryBootstrap(serverUrl);
  if (bootstrapToken) {
    console.log('  ✓ First-time setup — superadmin token generated.\n');
    console.log(`    Token: ${bootstrapToken}\n`);
    console.log('  ⚠ Store this token securely — it cannot be retrieved again.\n');
    await saveAdminToken(bootstrapToken);
    return bootstrapToken;
  }

  const hasExisting = existing !== null;

  const token = await password({
    message: hasExisting
      ? 'Admin token (press Enter to keep current)'
      : 'Paste your admin token',
    mask: '*',
    validate: (val) => {
      if (!val && hasExisting) return true;
      if (!val) return 'Token is required';
      if (val.length < 10) return 'Token seems too short';
      return true;
    },
  });

  const tokenToUse = token || existing!;

  process.stdout.write('  Validating token... ');
  try {
    await postNativeGateway(
      serverUrl,
      'admin.identities.list',
      {},
      { authorization: tokenToUse, signal: AbortSignal.timeout(5000) },
    );
    console.log('✓ Token valid');
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Token validation failed: ${msg}`);
  }

  await saveAdminToken(tokenToUse);
  return tokenToUse;
}
