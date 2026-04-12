/// <reference types="jest" />

import * as fs from 'fs';
import * as path from 'path';
import {
  addAgent,
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

  afterEach(() => {
    const f = getAgentRosterFilePath(token);
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    } catch {
      /* ignore */
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

  it('writes roster file under home .config with safe permissions when possible', () => {
    ensureAtLeastOneAgent(token);
    const f = getAgentRosterFilePath(token);
    expect(f).toContain(path.join('.config', 'topic-hub', 'agent-roster'));
    expect(fs.existsSync(f)).toBe(true);
    const st = fs.statSync(f);
    expect((st.mode & 0o777) & 0o077).toBe(0);
  });
});
