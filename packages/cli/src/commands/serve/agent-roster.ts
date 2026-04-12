import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MAX_LOCAL_AGENTS } from '@topichub/core';

export type AgentSlotState = 'idle' | 'busy' | 'queued';

export interface AgentEntry {
  id: string;
  createdAt: string;
  /**
   * After the first successful headless Claude (`-p`) run for this slot, `serve` sets this so the
   * next subprocess uses `claude --resume <id>` instead of `--session-id <id>` (session continuity).
   */
  claudeHeadlessResume?: boolean;
}

export interface AgentSlotView {
  slot: number;
  label: string;
  state: AgentSlotState;
}

const busySlotsByTokenHash = new Map<string, Set<number>>();

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 24);
}

/** Override with a writable directory if `~/.config/...` is not creatable (e.g. root-owned `~/.config`). */
export function getAgentRosterBaseDir(): string {
  const fromEnv = process.env.TOPIC_HUB_AGENT_ROSTER_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.join(os.homedir(), '.config', 'topic-hub', 'agent-roster');
}

function ensureAgentRosterDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(
        `Cannot create agent roster directory "${dir}": ${err.message}. On macOS/Linux, fix ownership of ~/.config (e.g. sudo chown -R "$(whoami)" ~/.config) or set TOPIC_HUB_AGENT_ROSTER_DIR to a writable path.`,
      );
    }
    throw e;
  }
}

export function getAgentRosterFilePath(executorToken: string): string {
  const h = tokenHash(executorToken);
  const dir = getAgentRosterBaseDir();
  ensureAgentRosterDir(dir);
  return path.join(dir, `${h}.json`);
}

type RosterFile = { agents: AgentEntry[] };

function readFileJson(file: string): RosterFile {
  if (!fs.existsSync(file)) {
    return { agents: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const j = JSON.parse(raw) as RosterFile;
    if (!j || !Array.isArray(j.agents)) {
      return { agents: [] };
    }
    return { agents: j.agents };
  } catch {
    return { agents: [] };
  }
}

function writeFileJson(file: string, data: RosterFile): void {
  const dir = path.dirname(file);
  ensureAgentRosterDir(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    /* non-fatal */
  }
  fs.renameSync(tmp, file);
}

export function loadAgents(executorToken: string): AgentEntry[] {
  return readFileJson(getAgentRosterFilePath(executorToken)).agents;
}

export function saveAgents(executorToken: string, agents: AgentEntry[]): void {
  if (agents.length > MAX_LOCAL_AGENTS) {
    throw new Error(`At most ${MAX_LOCAL_AGENTS} local agents are supported.`);
  }
  writeFileJson(getAgentRosterFilePath(executorToken), { agents });
}

/** Ensure at least one agent exists (bootstrap `#1`). */
export function ensureAtLeastOneAgent(executorToken: string): AgentEntry[] {
  let agents = loadAgents(executorToken);
  if (agents.length === 0) {
    agents = [{ id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
    saveAgents(executorToken, agents);
  }
  return agents;
}

export function addAgent(executorToken: string): { agents: AgentEntry[]; newSlot: number } {
  const agents = [...loadAgents(executorToken)];
  if (agents.length >= MAX_LOCAL_AGENTS) {
    throw new Error(`At most ${MAX_LOCAL_AGENTS} local agents are supported.`);
  }
  agents.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  saveAgents(executorToken, agents);
  return { agents, newSlot: agents.length };
}

export function removeAgentAtSlot(
  executorToken: string,
  slot1Based: number,
): { ok: true; agents: AgentEntry[] } | { ok: false; error: string } {
  const agents = loadAgents(executorToken);
  if (slot1Based < 1 || slot1Based > agents.length) {
    return { ok: false, error: `No agent at slot #${slot1Based}.` };
  }
  const h = tokenHash(executorToken);
  const busy = busySlotsByTokenHash.get(h);
  if (busy?.has(slot1Based)) {
    return { ok: false, error: `Agent #${slot1Based} is busy — try again after it finishes.` };
  }
  const next = agents.filter((_, i) => i !== slot1Based - 1);
  saveAgents(executorToken, next);
  return { ok: true, agents: next };
}

export function setAgentSlotBusy(executorToken: string, slot1Based: number, busy: boolean): void {
  const h = tokenHash(executorToken);
  let set = busySlotsByTokenHash.get(h);
  if (!set) {
    set = new Set();
    busySlotsByTokenHash.set(h, set);
  }
  if (busy) {
    set.add(slot1Based);
  } else {
    set.delete(slot1Based);
  }
}

export function listAgentSlots(executorToken: string): AgentSlotView[] {
  const agents = loadAgents(executorToken);
  const h = tokenHash(executorToken);
  const busy = busySlotsByTokenHash.get(h) ?? new Set();
  return agents.map((a, i) => ({
    slot: i + 1,
    label: `id ${a.id.slice(0, 8)}…`,
    state: busy.has(i + 1) ? ('busy' as const) : ('idle' as const),
  }));
}

/** Mark slot so the next headless Claude run uses `--resume` with that row's `id`. No-op if out of range. */
export function markClaudeHeadlessSessionReady(executorToken: string, slot1Based: number): void {
  const agents = [...loadAgents(executorToken)];
  const idx = slot1Based - 1;
  if (idx < 0 || idx >= agents.length) {
    return;
  }
  const cur = agents[idx]!;
  if (cur.claudeHeadlessResume === true) {
    return;
  }
  agents[idx] = { ...cur, claudeHeadlessResume: true };
  saveAgents(executorToken, agents);
}
