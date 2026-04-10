import { select } from '@inquirer/prompts';

interface TenantInfo {
  _id: string;
  name: string;
}

export async function promptTenantSelect(
  serverUrl: string,
  token: string,
  currentTenantId?: string,
): Promise<string> {
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
    throw new Error('No tenants available for this token');
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

  return tenantId;
}
