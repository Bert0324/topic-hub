import { ApiClient } from '../api-client/api-client.js';

export async function handleHealthCommand() {
  const api = new ApiClient();
  try {
    const health = await api.get<{ status?: string; db?: string; skills?: number }>('/health');
    console.log(`\nServer: ${api.baseUrl}`);
    console.log(`Status: ✓ ${health.status}`);
    console.log(`Database: ${health.db ?? 'unknown'}`);
    console.log(`Skills: ${health.skills ?? 0} active`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log('\nServer: unreachable');
    console.log(`Error: ${message}`);
  }
}
