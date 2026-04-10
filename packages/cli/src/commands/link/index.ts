import { ApiClient } from '../../api-client/api-client.js';

export async function handleLinkCommand(args: string[]): Promise<void> {
  const code = args[0];
  if (!code) {
    console.error('Usage: topichub-admin link <pairing-code>');
    process.exit(1);
  }

  const client = new ApiClient();

  try {
    const result = await client.post<{
      status: string;
      topichubUserId: string;
      platform: string;
      platformUserId: string;
    }>('/api/v1/identity/link', { code });

    console.log(
      `Linked! Your IM identity (${result.platform}/${result.platformUserId}) is now bound to this CLI.`,
    );
  } catch (err) {
    console.error(
      'Link failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
