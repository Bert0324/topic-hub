import os from 'node:os';
import {
  HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_CONCURRENT_AGENTS,
  parseImAgentControlOpFromEnrichedPayload,
} from '@topichub/core';
import { postNativeGateway } from '../../api-client/native-gateway.js';
import { loadConfig } from '../../config/config.js';
import { loadAdminToken, loadIdentityToken } from '../../auth/auth.js';
import { detectAgents, isAgentAvailable } from '../../executors/detector.js';
import { EventConsumer, type DispatchEvent } from './event-consumer.js';
import { TaskProcessor } from './task-processor.js';
import { renderStatus, type ServeStatus, type EventLogEntry } from './status-display.js';
import { resolveServeExecutorArgs } from './resolve-executor-args.js';
import { normalizeAgentCwd, resolveServeInvocationDirectory } from './resolve-agent-cwd.js';
import { bootstrapAgentRosterDirForServe } from './agent-roster.js';

export async function handleServeCommand(args: string[]): Promise<void> {
  const config = loadConfig();

  const executorFlag = extractFlag(args, '--executor');
  const maxAgentsFlag = extractFlag(args, '--max-agents');
  const agentCwdFlag = extractFlag(args, '--agent-cwd');
  const sessionAgentCwdRaw = (agentCwdFlag ?? process.env.TOPICHUB_AGENT_CWD)?.trim();
  const sessionAgentCwd = normalizeAgentCwd(sessionAgentCwdRaw || undefined);
  if (sessionAgentCwdRaw && !sessionAgentCwd) {
    console.warn(
      '⚠ --agent-cwd / TOPICHUB_AGENT_CWD is not an existing directory; agent cwd falls back to INIT_CWD or process.cwd().',
    );
  }
  const forceFlag = args.includes('--force');
  const skipExecutorPrompts = args.includes('--yes');

  const maxConcurrentAgents = maxAgentsFlag
    ? Math.max(1, Math.min(10, parseInt(maxAgentsFlag, 10) || DEFAULT_MAX_CONCURRENT_AGENTS))
    : config.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT_AGENTS;

  const identityToken = await loadIdentityToken();
  const token = identityToken ?? (await loadAdminToken());
  if (!token) {
    console.error(
      'No identity/admin token found. Run `topichub-admin login <identity-token>` first (or enter one during `init`).',
    );
    process.exit(1);
  }

  const activeExecutor = executorFlag ?? config.executor;
  if (activeExecutor !== 'none' && !isAgentAvailable(activeExecutor as any)) {
    console.warn(
      `⚠ Executor "${activeExecutor}" not found on PATH. Agent execution may fail.`,
    );
  }

  const rosterBootstrap = bootstrapAgentRosterDirForServe();
  if (rosterBootstrap.usedFallback) {
    console.warn(
      `⚠ Agent roster storage under ~/.config is not writable; switched to "${rosterBootstrap.dir}" for this serve session.`,
    );
  }

  // ── Executor registration ──────────────────────────────────────────
  const baseUrl = config.serverUrl.replace(/\/+$/, '');
  let regData: { executorToken: string; identityId: string; identityUniqueId: string };
  try {
    regData = await postNativeGateway<{
      executorToken: string;
      identityId: string;
      identityUniqueId: string;
    }>(
      baseUrl,
      'executors.register',
      {
        executorMeta: {
          agentType: activeExecutor,
          maxConcurrentAgents,
          hostname: os.hostname(),
          pid: process.pid,
        },
      },
      { authorization: token },
    );
  } catch (err) {
    const code =
      err instanceof Error && err.cause && typeof err.cause === 'object' && 'code' in err.cause
        ? String((err.cause as { code?: unknown }).code)
        : undefined;
    if (code === 'ECONNREFUSED') {
      console.error(
        `Cannot reach Topic Hub at ${baseUrl} (connection refused). ` +
          'Start the API first, e.g. from the repo root: ./start-local.sh — or `pnpm --filter @topichub/server run dev` with MongoDB running.',
      );
      process.exit(1);
    }
    throw err;
  }

  const executorToken = regData.executorToken;

  let pairingCode: string | null = null;
  let pairingExpiresAt: string | null = null;
  let pairingWarning: string | null = null;

  // Generate pairing code for IM binding (shown in renderStatus — avoid console.log here: console.clear wipes it)
  try {
    const pairingData = await postNativeGateway<{ code: string; expiresAt?: string }>(
      baseUrl,
      'executors.pairing_code',
      {},
      { authorization: executorToken },
    );
    pairingCode = pairingData.code;
    pairingExpiresAt = pairingData.expiresAt ?? null;
  } catch (err) {
    pairingWarning = err instanceof Error ? err.message : 'Could not reach pairing-code gateway op';
  }

  const agents = detectAgents();
  const agentMatch =
    activeExecutor === 'claude-code' || activeExecutor === 'codex'
      ? agents.find((a) => a.type === activeExecutor)
      : undefined;
  const agentCliLine = agentMatch
    ? `${agentMatch.command} ${agentMatch.version} — ${agentMatch.path}`
    : undefined;

  const resolvedExecutorArgs = await resolveServeExecutorArgs(
    activeExecutor,
    config.executorArgs,
    { skipPrompts: skipExecutorPrompts },
  );
  const executorLaunchArgsLine =
    resolvedExecutorArgs && resolvedExecutorArgs.length > 0
      ? resolvedExecutorArgs.join(' ')
      : undefined;

  // ── Heartbeat timer ────────────────────────────────────────────────
  const heartbeatTimer = setInterval(async () => {
    try {
      await postNativeGateway(
        baseUrl,
        'executors.heartbeat',
        {},
        { authorization: executorToken },
      );
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
    identityUniqueId: regData.identityUniqueId,
    defaultAgentCwd: sessionAgentCwd ?? resolveServeInvocationDirectory() ?? process.cwd(),
    agentCliLine,
    executorLaunchArgsLine,
    pairingCode,
    pairingExpiresAt,
    pairingWarning,
    pairingRotatedNotice: null,
    events: [],
    startedAt: new Date(),
    counters: { completed: 0, running: 0, failed: 0 },
  };

  const updateDisplay = () => renderStatus(status);

  let pairingRotatedNoticeTimer: ReturnType<typeof setTimeout> | undefined;

  const taskQueue: DispatchEvent[] = [];

  let drainQueue: () => void = () => {};

  const onEventUpdate = (entry: EventLogEntry) => {
    // Only merge by stable dispatch id. A fuzzy (skill + topic + running) match would collapse
    // parallel runs (e.g. two `chat` dispatches on different agent slots) into one row and undercount RUN.
    const idx =
      entry.dispatchId != null
        ? status.events.findIndex((e) => e.dispatchId === entry.dispatchId)
        : -1;
    if (idx >= 0) {
      status.events[idx] = entry;
    } else {
      status.events.push(entry);
    }

    status.counters = { completed: 0, running: 0, failed: 0 };
    for (const e of status.events) {
      if (e.status === 'completed') status.counters.completed++;
      else if (e.status === 'failed') status.counters.failed++;
      else if (e.status === 'running') status.counters.running++;
    }

    updateDisplay();
  };

  const processor = new TaskProcessor({
    serverUrl: config.serverUrl,
    token: executorToken,
    skillsDir: config.skillsDir,
    configExecutor: config.executor,
    cliExecutorFlag: executorFlag,
    executorArgs: resolvedExecutorArgs,
    maxConcurrentAgents,
    sessionAgentCwd,
    onEventUpdate,
  });

  drainQueue = () => {
    while (taskQueue.length > 0 && processor.canAcceptMore()) {
      const dispatch = taskQueue.shift()!;
      processor.process(dispatch).finally(drainQueue);
    }
  };

  const enqueueIncomingDispatch = async (event: DispatchEvent) => {
    if (parseImAgentControlOpFromEnrichedPayload(event.enrichedPayload) != null) {
      void processor.process(event).finally(() => {
        drainQueue();
      });
      return;
    }
    taskQueue.push(event);
    drainQueue();
  };

  const consumer = new EventConsumer({
    serverUrl: config.serverUrl,
    token: executorToken,
    onDispatch: (event) => {
      void enqueueIncomingDispatch(event);
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
    onPairingRotated: (payload) => {
      status.pairingCode = payload.code;
      status.pairingExpiresAt = payload.expiresAt ?? null;
      status.pairingWarning = null;
      status.pairingRotatedNotice =
        'Pairing code was rotated (previous code was exposed). Copy the new code below; use /register in DM only.';
      if (pairingRotatedNoticeTimer) {
        clearTimeout(pairingRotatedNoticeTimer);
      }
      pairingRotatedNoticeTimer = setTimeout(() => {
        status.pairingRotatedNotice = null;
        pairingRotatedNoticeTimer = undefined;
        updateDisplay();
      }, 90_000);
      (pairingRotatedNoticeTimer as NodeJS.Timeout).unref();
      updateDisplay();
    },
  });

  // Graceful shutdown (T025)
  const shutdown = async () => {
    console.log('\n  Shutting down...');
    clearInterval(heartbeatTimer);
    if (pairingRotatedNoticeTimer) {
      clearTimeout(pairingRotatedNoticeTimer);
    }
    consumer.stop();

    try {
      await postNativeGateway(
        baseUrl,
        'executors.deregister',
        {},
        { authorization: executorToken },
      );
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
