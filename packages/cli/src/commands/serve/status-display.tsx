export interface EventLogEntry {
  /** Stable row key — same dispatch updates the same line in the Events table. */
  dispatchId?: string;
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
  executor: string;
  skillsDir: string;
  maxConcurrentAgents: number;
  /** Executor identity from registration (for IM binding). */
  identityUniqueId: string;
  /** Effective default cwd: `serve --agent-cwd` / `TOPICHUB_AGENT_CWD` if set, else `INIT_CWD` / `process.cwd()`. Topic `metadata.executorCwd` overrides per dispatch. */
  defaultAgentCwd?: string;
  /** Resolved agent binary when a local executor is active (spawned per task). */
  agentCliLine?: string;
  /** Extra argv passed to the agent CLI after `serve` resolved prompts / defaults. */
  executorLaunchArgsLine?: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  /** Shown when pairing could not be obtained (HTTP error, network, etc.). */
  pairingWarning: string | null;
  /** Ephemeral banner after server-side pairing rotation (e.g. code exposed in a group). */
  pairingRotatedNotice: string | null;
  /** How local `serve` pulls dispatches from Mongo when API has multiple replicas (see TOPICHUB_DISPATCH_POLL_MS). */
  dispatchBacklogHint?: string;
  events: EventLogEntry[];
  startedAt: Date;
  counters: { completed: number; running: number; failed: number };
}

const STATUS_LABEL: Record<EventLogEntry['status'], string> = {
  running: 'RUN',
  completed: 'OK ',
  failed: 'ERR',
};

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const COL_TIME = 10;
const COL_STATE = 5;
const COL_SKILL = 18;
const COL_TOPIC = 28;
const COL_DUR = 7;
const COL_ERR = 36;
const MAX_ERR = 80;

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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  return `${s.slice(0, max - 3)}...`;
}

function pad(s: string, w: number): string {
  const t = s.length >= w ? s.slice(0, w) : s;
  return t.padEnd(w);
}

function stateColor(status: EventLogEntry['status'], useColor: boolean): string {
  if (!useColor) return '';
  if (status === 'completed') return ANSI.green;
  if (status === 'failed') return ANSI.red;
  return ANSI.yellow;
}

export function renderStatus(status: ServeStatus): void {
  console.clear();

  const useColor = process.stdout.isTTY === true;
  const dim = useColor ? ANSI.dim : '';
  const rst = useColor ? ANSI.reset : '';
  const warn = useColor ? ANSI.yellow : '';
  const cyan = useColor ? ANSI.cyan : '';
  const b = useColor ? ANSI.bold : '';

  const connStr = status.connected ? 'connected' : 'disconnected';
  const connHi = useColor
    ? status.connected
      ? `${b}${ANSI.green}${connStr}${rst}`
      : `${b}${ANSI.yellow}${connStr}${rst}`
    : connStr.toUpperCase();
  console.log(
    `  Topic Hub Serve — ${connHi} to ${status.serverUrl}`,
  );
  console.log(
    `  Executor: ${status.executor} | Skills: ${status.skillsDir} | In flight: ${status.counters.running}/${status.maxConcurrentAgents}`,
  );
  console.log(`  Identity: ${status.identityUniqueId}`);
  if (status.agentCliLine) {
    console.log(
      `  Agent: ${status.agentCliLine} (subprocess per IM dispatch — roster slots: \`/agent list\`)`,
    );
  } else if (status.executor !== 'none') {
    console.log(
      `  Agent: not found on PATH — install the CLI or fix PATH before accepting dispatches`,
    );
  }
  if (status.executorLaunchArgsLine && status.executor !== 'none') {
    console.log(
      `${dim}  Launch args:${rst} ${truncate(status.executorLaunchArgsLine, 140)}`,
    );
  }
  if (status.defaultAgentCwd && status.executor !== 'none') {
    console.log(
      `${dim}  Agent cwd (default, topic may override):${rst} ${truncate(status.defaultAgentCwd, 100)}`,
    );
  }
  if (status.pairingRotatedNotice) {
    console.log(
      `  ${warn}⚠ ${status.pairingRotatedNotice}${rst}`,
    );
  }
  if (status.pairingCode) {
    const exp =
      status.pairingExpiresAt != null
        ? new Date(status.pairingExpiresAt).toLocaleTimeString()
        : '';
    console.log(
      `${dim}  IM bind:${rst} ${cyan}/register ${status.pairingCode}${rst}${exp ? `${dim} (expires ${exp})${rst}` : ''}`,
    );
  } else if (status.pairingWarning) {
    console.log(`  ${warn}IM bind: ${status.pairingWarning}${rst}`);
  }
  if (status.dispatchBacklogHint) {
    console.log(`${dim}  ${status.dispatchBacklogHint}${rst}`);
  }
  console.log();

  if (status.events.length > 0) {
    const recent = status.events.slice(-15);
    const sep = `  ${'─'.repeat(
      COL_TIME + COL_STATE + COL_SKILL + COL_TOPIC + COL_DUR + COL_ERR + 9,
    )}`;
    console.log(`${dim}  Events${rst}`);
    console.log(sep);
    console.log(
      `  ${pad('Time', COL_TIME)}  ${pad('St', COL_STATE)}  ${pad('Skill', COL_SKILL)}  ${pad('Topic', COL_TOPIC)}  ${pad('Dur', COL_DUR)}  ${pad('Detail', COL_ERR)}`,
    );
    console.log(sep);
    for (const evt of recent) {
      const time = formatTime(evt.timestamp);
      const st = STATUS_LABEL[evt.status];
      const dur =
        evt.durationMs != null ? formatDuration(evt.durationMs) : '—';
      const errRaw = evt.error ?? (evt.status === 'running' ? '…' : '—');
      const err = truncate(errRaw.replace(/\s+/g, ' ').trim(), MAX_ERR);
      const sc = stateColor(evt.status, useColor);
      console.log(
        `  ${pad(time, COL_TIME)}  ${sc}${pad(st, COL_STATE)}${rst}  ${pad(evt.skillName, COL_SKILL)}  ${pad(truncate(evt.topicTitle, COL_TOPIC), COL_TOPIC)}  ${pad(dur, COL_DUR)}  ${dim}${pad(truncate(err, COL_ERR), COL_ERR)}${rst}`,
      );
    }
    console.log(sep);
    console.log();
  }

  const { completed, running, failed } = status.counters;
  const uptime = formatUptime(status.startedAt);
  console.log(
    `  Status: ${completed} completed, ${running} running, ${failed} failed | Uptime: ${uptime}`,
  );
}
