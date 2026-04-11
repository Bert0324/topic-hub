import os from 'node:os';
import { HEARTBEAT_INTERVAL_MS, DEFAULT_MAX_CONCURRENT_AGENTS } from '@topichub/core';
import { loadConfig } from '../../config/config.js';
import { loadAdminToken } from '../../auth/auth.js';
import { isAgentAvailable } from '../../executors/detector.js';
import { ApiClient } from '../../api-client/api-client.js';
import { EventConsumer, type DispatchEvent } from './event-consumer.js';
import { TaskProcessor } from './task-processor.js';
import { QaRelay } from './qa-relay.js';
import { renderStatus, type ServeStatus, type EventLogEntry } from './status-display.js';

export async function handleServeCommand(args: string[]): Promise<void> {
  const config = loadConfig();

  const executorFlag = extractFlag(args, '--executor');
  const maxAgentsFlag = extractFlag(args, '--max-agents');
  const forceFlag = args.includes('--force');

  const maxConcurrentAgents = maxAgentsFlag
    ? Math.max(1, Math.min(10, parseInt(maxAgentsFlag, 10) || DEFAULT_MAX_CONCURRENT_AGENTS))
    : config.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT_AGENTS;

  const token = await loadAdminToken();
  if (!token) {
    console.error('No admin token found. Run `topichub-admin init` first.');
    process.exit(1);
  }

  const activeExecutor = executorFlag ?? config.executor;
  if (activeExecutor !== 'none' && !isAgentAvailable(activeExecutor as any)) {
    console.warn(
      `⚠ Executor "${activeExecutor}" not found on PATH. Agent execution may fail.`,
    );
  }

  // ── Executor registration ──────────────────────────────────────────
  const baseUrl = config.serverUrl.replace(/\/+$/, '');
  const regRes = await fetch(`${baseUrl}/api/v1/executors/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      executorMeta: {
        agentType: activeExecutor,
        maxConcurrentAgents,
        hostname: os.hostname(),
        pid: process.pid,
      },
    }),
  });

  if (!regRes.ok) {
    const err = await regRes.json().catch(() => ({ message: regRes.statusText })) as { message?: string };
    console.error(`✗ Executor registration failed: ${err.message ?? `HTTP ${regRes.status}`}`);
    process.exit(1);
  }

  const regData = await regRes.json() as {
    executorToken: string;
    identityId: string;
    identityUniqueId: string;
  };
  const executorToken = regData.executorToken;

  console.log(`  ✓ Executor registered (identity=${regData.identityUniqueId})`);
  console.log(`  ✓ Executor token: ${executorToken.slice(0, 16)}...`);
  console.log(`  ✓ Max concurrent agents: ${maxConcurrentAgents}`);

  // ── Heartbeat timer ────────────────────────────────────────────────
  const heartbeatTimer = setInterval(async () => {
    try {
      await fetch(`${baseUrl}/api/v1/executors/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${executorToken}`,
        },
      });
    } catch {
      // heartbeat failure is non-fatal; server will consider executor stale after threshold
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  const status: ServeStatus = {
    connected: false,
    serverUrl: config.serverUrl,
    executor: activeExecutor,
    skillsDir: config.skillsDir,
    maxConcurrentAgents,
    events: [],
    startedAt: new Date(),
    counters: { completed: 0, running: 0, failed: 0 },
  };

  const updateDisplay = () => renderStatus(status);

  const taskQueue: DispatchEvent[] = [];

  const onEventUpdate = (entry: EventLogEntry) => {
    const idx = status.events.findIndex(
      (e) =>
        e.skillName === entry.skillName &&
        e.topicTitle === entry.topicTitle &&
        e.status === 'running',
    );
    if (idx >= 0) {
      status.events[idx] = entry;
    } else {
      status.events.push(entry);
    }

    if (entry.status === 'completed') {
      status.counters.completed++;
      status.counters.running = Math.max(0, status.counters.running - 1);
    } else if (entry.status === 'failed') {
      status.counters.failed++;
      status.counters.running = Math.max(0, status.counters.running - 1);
    } else if (entry.status === 'running') {
      status.counters.running++;
    }

    updateDisplay();
  };

  const qaApiClient = new ApiClient(config.serverUrl, executorToken);
  const qaRelay = new QaRelay(qaApiClient);

  const processor = new TaskProcessor({
    serverUrl: config.serverUrl,
    token: executorToken,
    skillsDir: config.skillsDir,
    configExecutor: config.executor,
    cliExecutorFlag: executorFlag,
    executorArgs: config.executorArgs,
    maxConcurrentAgents,
    onEventUpdate,
    onAgentQuestion: async (dispatchId, question, context) => {
      try {
        const { qaId } = await qaRelay.postQuestion(dispatchId, question, context);
        console.log(`[QA]       Question posted (qaId=${qaId}), waiting for answer...`);
        const answer = await qaRelay.waitForAnswer(dispatchId, qaId);
        if (answer) {
          console.log(`[QA]       Answer received for qaId=${qaId}`);
        } else {
          console.log(`[QA]       Timed out waiting for answer (qaId=${qaId})`);
        }
        return answer;
      } catch (err) {
        console.error(`[QA]       Failed to relay question: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  });

  const drainQueue = () => {
    while (taskQueue.length > 0 && processor.canAcceptMore()) {
      const dispatch = taskQueue.shift()!;
      processor.process(dispatch).finally(drainQueue);
    }
  };

  const consumer = new EventConsumer({
    serverUrl: config.serverUrl,
    token: executorToken,
    executorToken,
    onDispatch: (event) => {
      taskQueue.push(event);
      drainQueue();
    },
    onConnected: () => {
      status.connected = true;
      updateDisplay();
    },
    onDisconnected: () => {
      status.connected = false;
      updateDisplay();
    },
    onHeartbeat: () => {
      updateDisplay();
    },
  });

  // Graceful shutdown (T025)
  const shutdown = async () => {
    console.log('\n  Shutting down...');
    clearInterval(heartbeatTimer);
    consumer.stop();

    try {
      await fetch(`${baseUrl}/api/v1/executors/deregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${executorToken}`,
        },
      });
    } catch {
      // best-effort deregister
    }

    if (processor.isProcessing) {
      console.log(`  Waiting for ${processor.activeTaskCount} in-flight agent(s) to finish (up to 30s)...`);
      const deadline = Date.now() + 30_000;
      while (processor.isProcessing && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log('  ✓ Stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  updateDisplay();
  await consumer.start();
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const eqFlag = args.find((a) => a.startsWith(`${flag}=`));
  return eqFlag?.split('=')[1];
}
