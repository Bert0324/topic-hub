import { loadConfig } from '../../config/config.js';
import { loadAdminToken } from '../../auth/auth.js';
import { isAgentAvailable } from '../../executors/detector.js';
import { EventConsumer, type DispatchEvent } from './event-consumer.js';
import { TaskProcessor } from './task-processor.js';
import { renderStatus, type ServeStatus, type EventLogEntry } from './status-display.js';

export async function handleServeCommand(args: string[]): Promise<void> {
  const config = loadConfig();

  const executorFlag = extractFlag(args, '--executor');

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

  const status: ServeStatus = {
    connected: false,
    serverUrl: config.serverUrl,
    tenantId: config.tenantId,
    executor: activeExecutor,
    skillsDir: config.skillsDir,
    events: [],
    startedAt: new Date(),
    counters: { completed: 0, running: 0, failed: 0 },
  };

  const updateDisplay = () => renderStatus(status);

  const taskQueue: DispatchEvent[] = [];
  let processingNext = false;

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

  const processor = new TaskProcessor({
    serverUrl: config.serverUrl,
    token,
    skillsDir: config.skillsDir,
    configExecutor: config.executor,
    cliExecutorFlag: executorFlag,
    onEventUpdate,
  });

  const processQueue = async () => {
    if (processingNext || taskQueue.length === 0) return;
    processingNext = true;

    while (taskQueue.length > 0) {
      const dispatch = taskQueue.shift()!;
      await processor.process(dispatch);
    }

    processingNext = false;
  };

  const consumer = new EventConsumer({
    serverUrl: config.serverUrl,
    tenantId: config.tenantId,
    token,
    onDispatch: (event) => {
      taskQueue.push(event);
      processQueue();
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

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n  Shutting down...');
    consumer.stop();

    if (processor.isProcessing) {
      console.log('  Waiting for in-flight agent to finish (up to 30s)...');
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
