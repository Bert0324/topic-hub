import { select, input } from '@inquirer/prompts';

interface TenantInfo {
  _id: string;
  name: string;
}

interface CreatedTenant {
  id: string;
  apiKey: string;
  adminToken: string;
  isSuperAdmin: boolean;
}

export interface TenantSelectResult {
  tenantId: string;
  /** When a new tenant is created, this is the raw API key to use for auth */
  newApiKey?: string;
}

async function createTenant(serverUrl: string, name: string): Promise<CreatedTenant> {
  const res = await fetch(`${serverUrl}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CreatedTenant;
}

export async function promptTenantSelect(
  serverUrl: string,
  token: string,
  currentTenantId?: string,
): Promise<TenantSelectResult> {
  process.stdout.write('  Fetching tenants... ');
  let tenants: TenantInfo[];

  try {
    const res = await fetch(`${serverUrl}/admin/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tenants = (await res.json()) as TenantInfo[];
    console.log(`✓ Found ${tenants.length} tenant(s)`);
  } catch (err) {
    console.log('✗ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch tenants: ${msg}`);
  }

  if (tenants.length === 0) {
    console.log('\n  No tenants found — creating your first tenant.\n');

    const name = await input({
      message: 'Tenant name',
      default: 'local-dev',
      validate: (val) => (val.trim().length > 0 ? true : 'Name is required'),
    });

    process.stdout.write('  Creating tenant... ');
    try {
      const created = await createTenant(serverUrl, name.trim());
      const role = created.isSuperAdmin ? ' (super admin)' : '';
      console.log(`✓ Created${role}`);
      console.log(`  ✓ Tenant: ${name.trim()} (id: ${created.id})`);
      console.log(`\n  ── Credentials (auto-saved) ────────────────────`);
      console.log(`  API Key: ${created.apiKey}`);
      console.log(`  ────────────────────────────────────────────────\n`);
      return { tenantId: created.id, newApiKey: created.apiKey };
    } catch (err) {
      console.log('✗ Failed');
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create tenant: ${msg}`);
    }
  }

  if (tenants.length === 1) {
    console.log(`  ✓ Tenant: ${tenants[0].name} (id: ${tenants[0]._id})`);
    return { tenantId: tenants[0]._id };
  }

  const defaultIdx = tenants.findIndex((t) => t._id === currentTenantId);

  const tenantId = await select({
    message: 'Select tenant',
    choices: tenants.map((t) => ({
      name: `${t.name} (id: ${t._id})`,
      value: t._id,
    })),
    default: defaultIdx >= 0 ? tenants[defaultIdx]._id : undefined,
  });

  const selected = tenants.find((t) => t._id === tenantId);
  console.log(`  ✓ Tenant: ${selected?.name ?? tenantId}`);

  return { tenantId };
}
