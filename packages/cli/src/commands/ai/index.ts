import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { ApiClient } from '../../api-client/api-client.js';
import { loadConfig, loadConfigOrNull } from '../../config/config.js';
import { loadAdminToken } from '../../auth/auth.js';
import { resolveExecutorType, createExecutor } from '../../executors/executor-factory.js';
import { writeMcpConfig, cleanupMcpConfig } from '../../mcp/mcp-config-writer.js';

const api = new ApiClient();

interface AiStatusResponse {
  enabled: boolean;
  provider?: string;
  model?: string;
  apiUrl?: string;
  available?: boolean;
  circuitState?: string;
}

interface AiConfig {
  aiEnabled: boolean;
  rateLimit: number;
  usageThisHour: number;
}

interface AiUsageResponse {
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
      await api.patch('/admin/ai/config', { enabled: true });
      console.log('✓ AI enabled');
      break;
    }
    case 'disable': {
      await api.patch('/admin/ai/config', { enabled: false });
      console.log('✓ AI disabled');
      break;
    }
    case 'config': {
      if (args.includes('--show')) {
        const data = await api.get<AiConfig>('/admin/ai/config');
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
            await api.patch('/admin/ai/config', { rateLimit: limit });
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
        `/admin/ai/usage?hours=${hours}`,
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
    case 'run': {
      await handleAiRun(args);
      break;
    }
    case 'summarize': {
      await handleAiSummarize(args);
      break;
    }
    case 'ask': {
      await handleAiAsk(args);
      break;
    }
    default:
      console.log('Usage: topichub-admin ai <status|enable|disable|config|usage|run|summarize|ask>');
  }
}

async function handleAiRun(args: string[]) {
  const topicId = args[0];
  if (!topicId) {
    console.error('Usage: topichub-admin ai run <topic-id> --skill <name> [--executor <type>]');
    process.exit(1);
  }

  const skillFlag = extractFlag(args, '--skill');
  if (!skillFlag) {
    console.error('Missing required flag: --skill <name>');
    process.exit(1);
  }

  const executorFlag = extractFlag(args, '--executor');
  const executorArgsRaw = extractFlag(args, '--executor-args');

  const config = loadConfig();
  const token = await loadAdminToken();
  if (!token) {
    console.error('No admin token found. Run `topichub-admin init` first.');
    process.exit(1);
  }

  const runApi = new ApiClient(config.serverUrl);
  runApi.setToken(token);

  // Fetch topic
  console.log(`  Fetching topic ${topicId}...`);
  let topic: any;
  try {
    topic = await runApi.get(`/api/v1/topics/${topicId}`);
  } catch (err) {
    console.error(`  ✗ Topic not found: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Load SKILL.md
  const skillsDir = config.skillsDir.startsWith('~')
    ? path.join(process.env.HOME ?? '', config.skillsDir.slice(1))
    : path.resolve(config.skillsDir);

  const skillMdPath = path.join(skillsDir, skillFlag, 'SKILL.md');
  let systemPromptPath: string | null = null;
  let frontmatter: Record<string, any> = {};

  if (fs.existsSync(skillMdPath)) {
    const parsed = matter(fs.readFileSync(skillMdPath, 'utf-8'));
    frontmatter = parsed.data ?? {};
    systemPromptPath = skillMdPath;
  } else {
    console.warn(`  ⚠ No SKILL.md found at ${skillMdPath}. Running without skill instructions.`);
  }

  // Resolve executor
  const executorType = resolveExecutorType({
    skillFrontmatter: frontmatter,
    cliFlag: executorFlag,
    envVar: process.env.TOPICHUB_EXECUTOR,
    configValue: config.executor,
  });
  const executor = createExecutor(executorType);

  console.log(`  Executing ${skillFlag} on "${topic.title}"...`);
  console.log(`  Agent: ${executorType}`);

  // Build prompt
  const prompt = [
    'You are processing a one-off task from Topic Hub.',
    '',
    '## Topic',
    JSON.stringify(topic, null, 2),
  ].join('\n');

  // Write MCP config
  const mcpConfigPath = writeMcpConfig({
    serverUrl: config.serverUrl,
    token,
    allowedTools: frontmatter.allowedTools,
  });

  const extraArgs = executorArgsRaw
    ? executorArgsRaw.split(' ')
    : config.executorArgs;

  try {
    const result = await executor.execute(prompt, systemPromptPath, {
      mcpConfigPath,
      maxTurns: frontmatter.maxTurns,
      extraArgs,
    });

    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log();
    console.log('  Result:');
    console.log(`  ${result.text.split('\n').join('\n  ')}`);

    // Write timeline entry
    try {
      const entry = await runApi.post<{ _id: string }>(
        `/api/v1/topics/${topicId}/timeline`,
        {
          actionType: 'ai_response',
          actor: `ai:${skillFlag}`,
          payload: {
            skillName: skillFlag,
            content: result.text,
            executorType: result.executorType,
            durationMs: result.durationMs,
            tokenUsage: result.tokenUsage,
          },
        },
      );
      console.log(`\n  ✓ Timeline entry written (id: ${entry._id})`);
    } catch {
      console.warn('\n  ⚠ Failed to write timeline entry');
    }
  } catch (err) {
    console.error(
      `\n  ✗ Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  } finally {
    cleanupMcpConfig(mcpConfigPath);
  }
}

async function handleAiSummarize(args: string[]) {
  const topicId = args[0];
  if (!topicId) {
    console.error('Usage: topichub-admin ai summarize <topic-id>');
    process.exit(1);
  }

  console.log(`  Summarizing topic ${topicId}...`);

  try {
    const data = await api.post<{
      summary: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      timelineEntryId: string;
    }>('/api/v1/ai/summarize', { topicId });

    console.log();
    console.log('  Summary:');
    console.log(`  ${data.summary.split('\n').join('\n  ')}`);
    console.log();
    console.log(`  ✓ Timeline entry written (id: ${data.timelineEntryId})`);
    console.log(`  Model: ${data.model} | Tokens: ${data.usage.inputTokens}→${data.usage.outputTokens}`);
  } catch (err: any) {
    if (err?.statusCode === 404) {
      console.error(`  ✗ Topic not found: ${topicId}`);
    } else if (err?.statusCode === 503 || err?.body?.error === 'ai_unavailable') {
      console.error(`  ✗ AI unavailable: ${err?.body?.message ?? err?.message ?? 'Service unavailable'}`);
    } else {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

async function handleAiAsk(args: string[]) {
  const topicId = args[0];
  const question = args.slice(1).join(' ');
  if (!topicId || !question) {
    console.error('Usage: topichub-admin ai ask <topic-id> "<question>"');
    process.exit(1);
  }

  console.log(`  Asking about topic ${topicId}...`);

  try {
    const data = await api.post<{
      answer: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      timelineEntryId: string;
    }>('/api/v1/ai/ask', { topicId, question });

    console.log();
    console.log(`  Q: ${question}`);
    console.log();
    console.log(`  A: ${data.answer.split('\n').join('\n  ')}`);
    console.log();
    console.log(`  ✓ Timeline entry written (id: ${data.timelineEntryId})`);
    console.log(`  Model: ${data.model} | Tokens: ${data.usage.inputTokens}→${data.usage.outputTokens}`);
  } catch (err: any) {
    if (err?.statusCode === 404) {
      console.error(`  ✗ Topic not found: ${topicId}`);
    } else if (err?.statusCode === 503 || err?.body?.error === 'ai_unavailable') {
      console.error(`  ✗ AI unavailable: ${err?.body?.message ?? err?.message ?? 'Service unavailable'}`);
    } else {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eqFlag = args.find((a) => a.startsWith(`${flag}=`));
  return eqFlag?.split('=')[1];
}
