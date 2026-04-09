import { ApiClient } from '../../api-client/api-client.js';

const api = new ApiClient();

interface AiStatusResponse {
  enabled: boolean;
  provider?: string;
  model?: string;
  apiUrl?: string;
  available?: boolean;
  circuitState?: string;
}

interface AiTenantConfig {
  tenantId: string;
  aiEnabled: boolean;
  rateLimit: number;
  usageThisHour: number;
}

interface AiUsageResponse {
  tenantId: string;
  period: string;
  totalRequests: number;
  totalTokens: number;
  bySkill: Array<{ skillName: string; requests: number; tokens: number }>;
  limit: { requestsPerHour: number; usedThisHour: number; remaining: number };
}

export async function handleAiCommand(sub: string, args: string[]) {
  switch (sub) {
    case 'status': {
      const data = await api.get<AiStatusResponse>('/admin/ai/status');
      console.log('\nAI Provider');
      if (!data.enabled) {
        console.log('  Enabled:   ✗ no (AI_ENABLED=false)');
        return;
      }
      console.log(`  Provider:  ${data.provider}`);
      console.log(`  Model:     ${data.model}`);
      console.log(`  Endpoint:  ${data.apiUrl}`);
      console.log(`  Status:    ${data.available ? '✓ available' : '✗ unavailable'}`);
      console.log(`  Circuit:   ${data.circuitState}`);
      break;
    }
    case 'enable': {
      await api.patch('/admin/tenants/current/ai', { enabled: true });
      console.log('✓ AI enabled for current tenant');
      break;
    }
    case 'disable': {
      await api.patch('/admin/tenants/current/ai', { enabled: false });
      console.log('✓ AI disabled for current tenant');
      break;
    }
    case 'config': {
      if (args.includes('--show')) {
        const data = await api.get<AiTenantConfig>('/admin/tenants/current/ai');
        console.log('\nAI Configuration');
        console.log(`  AI Enabled:   ${data.aiEnabled ? '✓ yes' : '✗ no'}`);
        console.log(`  Rate Limit:   ${data.rateLimit} requests/hour`);
        console.log(`  Used (hour):  ${data.usageThisHour}/${data.rateLimit}`);
      } else {
        const setArg = args.find((a) => a.startsWith('--set'));
        if (setArg) {
          const value = args[args.indexOf(setArg) + 1] ?? setArg.split('=')[1];
          if (value?.startsWith('rate-limit=')) {
            const limit = parseInt(value.split('=')[1], 10);
            await api.patch('/admin/tenants/current/ai', { rateLimit: limit });
            console.log(`✓ Rate limit updated: ${limit} requests/hour`);
          }
        } else {
          console.log('Usage: topichub-admin ai config --show | --set rate-limit=<N>');
        }
      }
      break;
    }
    case 'usage': {
      const hours = args.find((a) => a.startsWith('--hours='))?.split('=')[1] ?? '24';
      const data = await api.get<AiUsageResponse>(
        `/admin/tenants/current/ai/usage?hours=${hours}`,
      );
      console.log(`\nAI Usage (${data.period})`);
      console.log('┌──────────────┬───────┬────────────┐');
      console.log('│ Skill        │ Count │ Tokens     │');
      console.log('├──────────────┼───────┼────────────┤');
      for (const s of data.bySkill) {
        console.log(
          `│ ${s.skillName.padEnd(12)} │ ${String(s.requests).padStart(5)} │ ${String(s.tokens.toLocaleString()).padStart(10)} │`,
        );
      }
      console.log('├──────────────┼───────┼────────────┤');
      console.log(
        `│ Total        │ ${String(data.totalRequests).padStart(5)} │ ${String(data.totalTokens.toLocaleString()).padStart(10)} │`,
      );
      console.log('└──────────────┴───────┴────────────┘');
      console.log(
        `\nRate Limit: ${data.limit.usedThisHour}/${data.limit.requestsPerHour} requests this hour (${data.limit.remaining} remaining)`,
      );
      break;
    }
    default:
      console.log('Usage: topichub-admin ai <status|enable|disable|config|usage>');
  }
}
