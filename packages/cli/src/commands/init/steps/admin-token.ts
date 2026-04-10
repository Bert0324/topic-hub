import { password } from '@inquirer/prompts';
import { saveAdminToken, loadAdminToken } from '../../../auth/auth.js';

export async function promptAdminToken(serverUrl: string): Promise<string> {
  const existing = await loadAdminToken();
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

  // Validate token against server
  process.stdout.write('  Validating token... ');
  try {
    const res = await fetch(`${serverUrl}/admin/tenants`, {
      headers: { Authorization: `Bearer ${tokenToUse}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('✓ Token valid');
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Token validation failed: ${msg}`);
  }

  await saveAdminToken(tokenToUse);
  return tokenToUse;
}
