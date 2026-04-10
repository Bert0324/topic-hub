import { ApiClient } from '../../api-client/api-client.js';

export async function handleUnlinkCommand(args: string[]): Promise<void> {
  const platform = extractFlag(args, '--platform');
  const platformUserId = extractFlag(args, '--user');

  const client = new ApiClient();

  try {
    const body: Record<string, string> = {};
    if (platform) body.platform = platform;
    if (platformUserId) body.platformUserId = platformUserId;

    const result = await client.post<{
      status: string;
      cancelledDispatches: number;
    }>('/api/v1/identity/unlink', body);

    console.log(`Unlinked. Cancelled dispatches: ${result.cancelledDispatches}`);
  } catch (err) {
    console.error(
      'Unlink failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const eqFlag = args.find((a) => a.startsWith(`${flag}=`));
  return eqFlag?.split('=')[1];
}
