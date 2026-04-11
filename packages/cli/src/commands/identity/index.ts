import { ApiClient } from '../../api-client/api-client.js';

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eqFlag = args.find((a) => a.startsWith(`${flag}=`));
  return eqFlag?.split('=')[1];
}

function buildClient(args: string[], token?: string): { client: ApiClient; token: string } {
  const serverUrl = extractFlag(args, '--server') ?? process.env.TOPICHUB_SERVER_URL;
  const resolvedToken = token ?? extractFlag(args, '--token') ?? process.env.TOPICHUB_SUPERADMIN_TOKEN ?? '';
  if (!resolvedToken) {
    console.error('Missing --token flag or TOPICHUB_SUPERADMIN_TOKEN env var.');
    process.exit(1);
  }
  const client = new ApiClient(serverUrl);
  client.setToken(resolvedToken);
  return { client, token: resolvedToken };
}

export async function handleIdentityCommand(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case 'create': {
      const uniqueId = extractFlag(args, '--unique-id');
      const name = extractFlag(args, '--name');
      if (!uniqueId || !name) {
        console.error('Usage: topichub-admin identity create --token <superadmin-token> --unique-id <id> --name <display-name> [--server <url>]');
        process.exit(1);
      }
      const { client } = buildClient(args);
      try {
        const result = await client.post<{
          id: string;
          uniqueId: string;
          displayName: string;
          token: string;
          message: string;
        }>('/api/v1/admin/identities', { uniqueId, displayName: name });

        console.log('\n  ✓ Identity created\n');
        console.log(`    ID:           ${result.id}`);
        console.log(`    Unique ID:    ${result.uniqueId}`);
        console.log(`    Display Name: ${result.displayName}`);
        console.log(`    Token:        ${result.token}`);
        console.log('\n  ⚠ Distribute this token securely — it cannot be retrieved again.\n');
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }
    case 'list': {
      const { client } = buildClient(args);
      try {
        const result = await client.get<{ identities: Array<{
          id: string;
          uniqueId: string;
          displayName: string;
          isSuperAdmin: boolean;
          status: string;
          executorCount: number;
          createdAt: string;
        }> }>('/api/v1/admin/identities');

        console.log('\n  Identities:\n');
        if (!result.identities.length) {
          console.log('    (none)');
        }
        for (const identity of result.identities) {
          const badge = identity.isSuperAdmin ? ' [superadmin]' : '';
          const executors = identity.executorCount > 0 ? ` (${identity.executorCount} active executor(s))` : '';
          console.log(`    ${identity.uniqueId}${badge} — ${identity.displayName} [${identity.status}]${executors}`);
          console.log(`      id=${identity.id}  created=${identity.createdAt}`);
        }
        console.log('');
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }
    case 'revoke': {
      const id = extractFlag(args, '--id');
      if (!id) {
        console.error('Usage: topichub-admin identity revoke --token <superadmin-token> --id <identity-id> [--server <url>]');
        process.exit(1);
      }
      const { client } = buildClient(args);
      try {
        const result = await client.post<{ status: string; executorsRevoked: number }>(
          `/api/v1/admin/identities/${id}/revoke`,
        );
        console.log(`\n  ✓ Identity revoked (${result.executorsRevoked} executor(s) also revoked)\n`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }
    case 'regenerate-token': {
      const id = extractFlag(args, '--id');
      if (!id) {
        console.error('Usage: topichub-admin identity regenerate-token --token <superadmin-token> --id <identity-id> [--server <url>]');
        process.exit(1);
      }
      const { client } = buildClient(args);
      try {
        const result = await client.post<{ token: string; executorsRevoked: number; message: string }>(
          `/api/v1/admin/identities/${id}/regenerate-token`,
        );
        console.log('\n  ✓ Token regenerated\n');
        console.log(`    New Token: ${result.token}`);
        console.log(`    Executors revoked: ${result.executorsRevoked}`);
        console.log('\n  ⚠ Distribute this token securely — it cannot be retrieved again.\n');
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.log('Usage: topichub-admin identity <subcommand> [options]');
      console.log('Subcommands:');
      console.log('  create              Create a new identity');
      console.log('  list                List all identities');
      console.log('  revoke              Revoke an identity');
      console.log('  regenerate-token    Regenerate identity token');
  }
}
