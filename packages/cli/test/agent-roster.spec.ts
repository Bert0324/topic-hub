/// <reference types="jest" />

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addAgent,
  bootstrapAgentRosterDirForServe,
  ensureAtLeastOneAgent,
  getAgentRosterFilePath,
  listAgentSlots,
  loadAgents,
  markClaudeHeadlessSessionReady,
  removeAgentAtSlot,
  saveAgents,
} from '../src/commands/serve/agent-roster';
import type { AgentEntry } from '../src/commands/serve/agent-roster';

describe('agent-roster', () => {
  const token = `test-token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let defaultTestRosterDir = '';
  let prevRosterDir: string | undefined;

  beforeEach(() => {
    prevRosterDir = process.env.TOPIC_HUB_AGENT_ROSTER_DIR;
    defaultTestRosterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-hub-roster-test-'));
    process.env.TOPIC_HUB_AGENT_ROSTER_DIR = defaultTestRosterDir;
  });

  afterEach(() => {
    try {
      fs.rmSync(defaultTestRosterDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    if (prevRosterDir === undefined) {
      delete process.env.TOPIC_HUB_AGENT_ROSTER_DIR;
    } else {
      process.env.TOPIC_HUB_AGENT_ROSTER_DIR = prevRosterDir;
    }
  });

  it('ensureAtLeastOneAgent creates one entry when empty', () => {
    const agents = ensureAtLeastOneAgent(token);
    expect(agents.length).toBe(1);
    expect(loadAgents(token).length).toBe(1);
  });

  it('markClaudeHeadlessSessionReady toggles claudeHeadlessResume for a slot', () => {
    ensureAtLeastOneAgent(token);
    expect(loadAgents(token)[0]!.claudeHeadlessResume).toBeUndefined();
    markClaudeHeadlessSessionReady(token, 1);
    expect(loadAgents(token)[0]!.claudeHeadlessResume).toBe(true);
    markClaudeHeadlessSessionReady(token, 1);
    expect(loadAgents(token)[0]!.claudeHeadlessResume).toBe(true);
  });

  it('addAgent appends and listAgentSlots reflects order', () => {
    saveAgents(token, [{ id: 'a', createdAt: new Date().toISOString() }]);
    const { newSlot, agents } = addAgent(token);
    expect(newSlot).toBe(2);
    expect(agents.length).toBe(2);
    const rows = listAgentSlots(token);
    expect(rows.map((r) => r.slot)).toEqual([1, 2]);
  });

  it('removeAgentAtSlot renumbers and rejects out of range', () => {
    const a: AgentEntry[] = [
      { id: '1', createdAt: 't1' },
      { id: '2', createdAt: 't2' },
    ];
    saveAgents(token, a);
    const r = removeAgentAtSlot(token, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agents.length).toBe(1);
      expect(r.agents[0]!.id).toBe('2');
    }
    expect(removeAgentAtSlot(token, 99).ok).toBe(false);
  });

  it('writes roster file with safe permissions', () => {
    ensureAtLeastOneAgent(token);
    const f = getAgentRosterFilePath(token);
    expect(fs.existsSync(f)).toBe(true);
    const st = fs.statSync(f);
    expect((st.mode & 0o777) & 0o077).toBe(0);
  });

  it('TOPIC_HUB_AGENT_ROSTER_DIR overrides roster directory', () => {
    const override = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'topic-hub-roster-test-')));
    const prev = process.env.TOPIC_HUB_AGENT_ROSTER_DIR;
    process.env.TOPIC_HUB_AGENT_ROSTER_DIR = override;
    try {
      ensureAtLeastOneAgent(token);
      const f = getAgentRosterFilePath(token);
      expect(f.startsWith(override)).toBe(true);
      expect(fs.existsSync(f)).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.TOPIC_HUB_AGENT_ROSTER_DIR;
      } else {
        process.env.TOPIC_HUB_AGENT_ROSTER_DIR = prev;
      }
      try {
        fs.rmSync(override, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('bootstrapAgentRosterDirForServe falls back when default roster directory is not writable', () => {
    delete process.env.TOPIC_HUB_AGENT_ROSTER_DIR;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-hub-home-test-'));
    const configRoot = path.join(tempHome, '.config');
    fs.mkdirSync(configRoot, { recursive: true, mode: 0o755 });
    fs.chmodSync(configRoot, 0o555);
    const fallbackDir = path.join(tempHome, '.topic-hub', 'agent-roster');

    try {
      const result = bootstrapAgentRosterDirForServe({ homeDir: tempHome });
      expect(result.usedFallback).toBe(true);
      expect(result.dir).toBe(fallbackDir);
      expect(process.env.TOPIC_HUB_AGENT_ROSTER_DIR).toBe(fallbackDir);
      expect(fs.existsSync(fallbackDir)).toBe(true);
    } finally {
      fs.chmodSync(configRoot, 0o755);
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
