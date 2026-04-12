import {
  stripAgentSlotFromSlashInvocationLine,
  stripLeadingAgentSlotFromPlainRelay,
} from '../src/im/agent-slot-parse';

describe('agent-slot-parse', () => {
  it('stripLeadingAgentSlotFromPlainRelay extracts leading #N', () => {
    expect(stripLeadingAgentSlotFromPlainRelay('#2 do the thing')).toEqual({
      agentSlot: 2,
      text: 'do the thing',
    });
  });

  it('stripLeadingAgentSlotFromPlainRelay leaves slash commands unchanged', () => {
    expect(stripLeadingAgentSlotFromPlainRelay('/answer #2 hi')).toEqual({
      agentSlot: null,
      text: '/answer #2 hi',
    });
  });

  it('stripLeadingAgentSlotFromPlainRelay rejects out-of-range slots', () => {
    const t = `#${999} x`;
    expect(stripLeadingAgentSlotFromPlainRelay(t)).toEqual({ agentSlot: null, text: t });
  });

  it('stripAgentSlotFromSlashInvocationLine extracts second token #N', () => {
    expect(stripAgentSlotFromSlashInvocationLine('/my-skill #3 run tests')).toEqual({
      agentSlot: 3,
      imText: '/my-skill run tests',
    });
  });

  it('stripAgentSlotFromSlashInvocationLine allows slash + #N only', () => {
    expect(stripAgentSlotFromSlashInvocationLine('/my-skill #1')).toEqual({
      agentSlot: 1,
      imText: '/my-skill',
    });
  });

  it('stripAgentSlotFromSlashInvocationLine leaves line without slot', () => {
    const s = '/my-skill run';
    expect(stripAgentSlotFromSlashInvocationLine(s)).toEqual({ agentSlot: null, imText: s });
  });
});
