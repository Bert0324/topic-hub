import {
  readAgentSlotFromDispatchDoc,
  stripOptionalImAgentTargetPrefix,
} from '../src/im/im-agent-target-prefix';
import { IM_PAYLOAD_AGENT_SLOT_KEY } from '../src/im/agent-slot-constants';

describe('stripOptionalImAgentTargetPrefix', () => {
  it('strips /agent #N and returns slot', () => {
    expect(stripOptionalImAgentTargetPrefix('/agent #2 /queue hi')).toEqual({
      line: '/queue hi',
      imTargetAgentSlot: 2,
    });
  });

  it('is case-insensitive on /agent', () => {
    expect(stripOptionalImAgentTargetPrefix('/Agent #3 /answer #1 ok')).toEqual({
      line: '/answer #1 ok',
      imTargetAgentSlot: 3,
    });
  });

  it('does not match /agent list', () => {
    const s = '/agent list';
    expect(stripOptionalImAgentTargetPrefix(s)).toEqual({ line: s });
  });

  it('rejects out-of-range slot', () => {
    const s = '/agent #9999 hello';
    expect(stripOptionalImAgentTargetPrefix(s)).toEqual({ line: s });
  });

  it('inserts / before queue or answer when omitted', () => {
    expect(stripOptionalImAgentTargetPrefix('/agent #2 queue hi')).toEqual({
      line: '/queue hi',
      imTargetAgentSlot: 2,
    });
    expect(stripOptionalImAgentTargetPrefix('/agent #1 answer #2 ok')).toEqual({
      line: '/answer #2 ok',
      imTargetAgentSlot: 1,
    });
  });
});

describe('readAgentSlotFromDispatchDoc', () => {
  it('reads slot from enriched payload', () => {
    expect(
      readAgentSlotFromDispatchDoc({
        enrichedPayload: { event: { payload: { [IM_PAYLOAD_AGENT_SLOT_KEY]: 4 } } },
      }),
    ).toBe(4);
  });

  it('defaults to 1', () => {
    expect(readAgentSlotFromDispatchDoc({})).toBe(1);
  });
});
