import {
  IM_ENRICHED_ROOT_AGENT_OP_KEY,
  IM_PAYLOAD_AGENT_OP_KEY,
} from '../src/im/agent-slot-constants';
import {
  parseImAgentControlOpFromEnrichedPayload,
  resolveImAgentControlOp,
} from '../src/im/im-agent-control-dispatch';

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

  it('falls back to root imAgentControlOp when nested payload is empty', () => {
    const rk = IM_ENRICHED_ROOT_AGENT_OP_KEY;
    expect(
      parseImAgentControlOpFromEnrichedPayload({
        [rk]: 'list',
        event: { payload: {} },
      }),
    ).toBe('list');
  });
});

describe('resolveImAgentControlOp', () => {
  const k = IM_PAYLOAD_AGENT_OP_KEY;

  it('prefers document-level imAgentControlOp on dispatch then claimed', () => {
    expect(
      resolveImAgentControlOp(
        { imAgentControlOp: 'list', enrichedPayload: { event: { payload: {} } } },
        { imAgentControlOp: 'create', enrichedPayload: {} },
      ),
    ).toBe('list');
    expect(
      resolveImAgentControlOp(
        { enrichedPayload: { event: { payload: {} } } },
        { imAgentControlOp: 'delete', enrichedPayload: {} },
      ),
    ).toBe('delete');
  });

  it('falls back to enrichedPayload when document-level op is absent', () => {
    expect(
      resolveImAgentControlOp(
        { enrichedPayload: { event: { payload: { [k]: 'list' } } } },
        { enrichedPayload: {} },
      ),
    ).toBe('list');
  });
});
