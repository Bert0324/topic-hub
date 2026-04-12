import { IM_PAYLOAD_AGENT_OP_KEY } from '../src/im/agent-slot-constants';
import { parseImAgentControlOpFromEnrichedPayload } from '../src/im/im-agent-control-dispatch';

describe('parseImAgentControlOpFromEnrichedPayload', () => {
  it('returns undefined for missing or non-control payloads', () => {
    expect(parseImAgentControlOpFromEnrichedPayload(undefined)).toBeUndefined();
    expect(parseImAgentControlOpFromEnrichedPayload({})).toBeUndefined();
    expect(parseImAgentControlOpFromEnrichedPayload({ event: {} })).toBeUndefined();
    expect(parseImAgentControlOpFromEnrichedPayload({ event: { payload: { text: 'hi' } } })).toBeUndefined();
  });

  it('detects list/create/delete', () => {
    const k = IM_PAYLOAD_AGENT_OP_KEY;
    expect(
      parseImAgentControlOpFromEnrichedPayload({
        event: { payload: { [k]: 'list' } },
      }),
    ).toBe('list');
    expect(
      parseImAgentControlOpFromEnrichedPayload({
        event: { payload: { [k]: 'create' } },
      }),
    ).toBe('create');
    expect(
      parseImAgentControlOpFromEnrichedPayload({
        event: { payload: { [k]: 'delete' } },
      }),
    ).toBe('delete');
  });
});
