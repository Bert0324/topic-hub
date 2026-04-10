import { input } from '@inquirer/prompts';

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

  // Validate connection (health is under the configured base path, not server root)
  process.stdout.write('  Connecting... ');
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { version?: string };
    console.log(`✓ Connected (v${data.version ?? 'unknown'})`);
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach server at ${baseUrl}: ${msg}`);
  }

  return baseUrl;
}
