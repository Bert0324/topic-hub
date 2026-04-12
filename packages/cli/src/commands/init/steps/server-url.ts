import { input } from '@inquirer/prompts';
import { postNativeGateway } from '../../../api-client/native-gateway.js';

export async function promptServerUrl(currentValue?: string): Promise<string> {
  const serverUrl = await input({
    message: 'Remote server URL',
    default: currentValue ?? 'http://localhost:3000',
    validate: (val) => {
      try {
        const url = new URL(val);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return 'URL must use http:// or https://';
        }
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  const baseUrl = serverUrl.replace(/\/+$/, '');

  // Validate connection: native integration gateway only (`POST …/topic-hub`, op `health`)
  process.stdout.write('  Connecting... ');
  try {
    await postNativeGateway<{ status?: string }>(
      baseUrl,
      'health',
      {},
      { signal: AbortSignal.timeout(5000) },
    );
    console.log('✓ Connected (native gateway)');
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach server at ${baseUrl}: ${msg}`);
  }

  return baseUrl;
}
