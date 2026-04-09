import { ApiClient } from '../api-client/api-client.js';

const api = new ApiClient();

type StatsResponse = {
  topics?: {
    total?: number;
    byType?: Record<string, number>;
    byStatus?: Record<string, number>;
  };
  skills?: { total?: number; enabled?: number };
};

export async function handleStatsCommand(_args: string[]) {
  const stats = await api.get<StatsResponse>('/admin/stats');
  console.log('\nTopic Hub Stats');
  console.log('═'.repeat(40));
  console.log(`Topics: ${stats.topics?.total ?? 0}`);
  if (stats.topics?.byType) {
    for (const [type, count] of Object.entries(stats.topics.byType)) {
      console.log(`  ${type}: ${count}`);
    }
  }
  if (stats.topics?.byStatus) {
    console.log('\nBy Status:');
    for (const [status, count] of Object.entries(stats.topics.byStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  }
  console.log(`\nSkills: ${stats.skills?.total ?? 0} installed, ${stats.skills?.enabled ?? 0} enabled`);
}
