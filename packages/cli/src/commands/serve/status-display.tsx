export interface EventLogEntry {
  timestamp: Date;
  skillName: string;
  topicTitle: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  error?: string;
}

export interface ServeStatus {
  connected: boolean;
  serverUrl: string;
  tenantId: string;
  executor: string;
  skillsDir: string;
  maxConcurrentAgents: number;
  events: EventLogEntry[];
  startedAt: Date;
  counters: { completed: number; running: number; failed: number };
}

const STATUS_ICONS: Record<EventLogEntry['status'], string> = {
  running: '⋯',
  completed: '✓',
  failed: '✗',
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUptime(startedAt: Date): string {
  const diff = Date.now() - startedAt.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function renderStatus(status: ServeStatus): void {
  console.clear();

  const connStr = status.connected ? 'connected' : 'disconnected';
  console.log(
    `  Topic Hub Serve — ${connStr} to ${status.serverUrl}`,
  );
  console.log(
    `  Tenant: ${status.tenantId} | Executor: ${status.executor} | Skills: ${status.skillsDir} | Agents: ${status.counters.running}/${status.maxConcurrentAgents}`,
  );
  console.log();

  if (status.events.length > 0) {
    console.log('  Events:');
    const recent = status.events.slice(-15);
    for (const evt of recent) {
      const icon = STATUS_ICONS[evt.status];
      const time = formatTime(evt.timestamp);
      const dur =
        evt.durationMs != null
          ? ` (${formatDuration(evt.durationMs)})`
          : '';
      const suffix = evt.error ? ` — ${evt.error}` : '';
      console.log(
        `  ${time}  ${icon}  ${evt.skillName} on "${evt.topicTitle}" — ${evt.status}${dur}${suffix}`,
      );
    }
    console.log();
  }

  const { completed, running, failed } = status.counters;
  const uptime = formatUptime(status.startedAt);
  console.log(
    `  Status: ${completed} completed, ${running} running, ${failed} failed | Uptime: ${uptime}`,
  );
}
