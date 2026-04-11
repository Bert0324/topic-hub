import { ApiClient } from '../../api-client/api-client.js';
import { loadConfig } from '../../config/config.js';

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eqFlag = args.find((a) => a.startsWith(`${flag}=`));
  return eqFlag?.split('=')[1];
}

function buildClient(): ApiClient {
  let serverUrl: string;
  try {
    serverUrl = loadConfig().serverUrl;
  } catch {
    console.error('No configuration. Run `topichub-admin init` first.');
    process.exit(1);
  }
  return new ApiClient(serverUrl);
}

export async function handleIdentityCommand(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case 'me': {
      const client = buildClient();
      try {
        const result = await client.get<{
          uniqueId: string;
          displayName: string;
          isSuperAdmin: boolean;
          status: string;
          executorCount: number;
          createdAt: string;
        }>('/api/v1/identity/me');

        const badge = result.isSuperAdmin ? ' [superadmin]' : '';
        console.log(`\n  ${result.uniqueId}${badge} — ${result.displayName}`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Active executors: ${result.executorCount}`);
        console.log(`  Created: ${result.createdAt}\n`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }
    case 'create': {
      const uniqueId = extractFlag(args, '--unique-id');
      const name = extractFlag(args, '--name');
      if (!uniqueId || !name) {
        console.error(
          'Usage: topichub-admin identity create --unique-id <id> --name <display-name>',
        );
        console.error('Requires superadmin token from `topichub-admin init` or `login`.');
        process.exit(1);
      }
      const client = buildClient();
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
      const client = buildClient();
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
        console.error('Usage: topichub-admin identity revoke --id <identity-id>');
        console.error('Requires superadmin token from `topichub-admin init` or `login`.');
        process.exit(1);
      }
      const client = buildClient();
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
        console.error('Usage: topichub-admin identity regenerate-token --id <identity-id>');
        console.error('Requires superadmin token from `topichub-admin init` or `login`.');
        process.exit(1);
      }
      const client = buildClient();
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
      console.log('  me                  View your own identity details');
      console.log('  create              Create a new identity (superadmin)');
      console.log('  list                List all identities (superadmin)');
      console.log('  revoke              Revoke an identity (superadmin)');
      console.log('  regenerate-token    Regenerate identity token (superadmin)');
  }
}
