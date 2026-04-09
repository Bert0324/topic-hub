import { ApiClient } from '../../api-client/api-client.js';

const api = new ApiClient();

export async function handleTenantCommand(sub: string, args: string[]) {
  switch (sub) {
    case 'create': {
      const nameIdx = args.indexOf('--name');
      const name = nameIdx >= 0 ? args[nameIdx + 1] : args[0];
      if (!name) {
        console.log('Usage: tenant create --name "Team Name"');
        return;
      }
      const result = await api.post<{
        id: string;
        apiKey: string;
        adminToken: string;
        expiryDays?: number;
      }>('/admin/tenants', { name });
      console.log('\nTenant created!');
      console.log(`  ID:          ${result.id}`);
      console.log(`  API Key:     ${result.apiKey}`);
      console.log(`  Admin Token: ${result.adminToken} (expires in ${result.expiryDays ?? 30} days)`);
      break;
    }
    case 'list': {
      const data = await api.get<{ tenants?: Array<{ name: string; slug: string; createdAt: string }> }>(
        '/admin/tenants'
      );
      console.log('\nTenants:');
      for (const t of data.tenants ?? []) {
        console.log(`  ${t.name} (${t.slug}) - created ${t.createdAt}`);
      }
      break;
    }
    case 'token': {
      if (args[0] === 'regenerate' && args[1]) {
        const result = await api.post<{ adminToken: string }>(`/admin/tenants/${args[1]}/token/regenerate`);
        console.log(`✓ Token regenerated: ${result.adminToken}`);
      } else {
        console.log('Usage: tenant token regenerate <tenant-id>');
      }
      break;
    }
    default:
      console.log('Usage: topichub-admin tenant <create|list|token>');
  }
}
