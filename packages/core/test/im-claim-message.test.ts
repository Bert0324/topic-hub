import { formatImClaimQueuedMessage, formatImClaimRunningMessage } from '../src/im/im-claim-message';
import { IM_PAYLOAD_AGENT_OP_KEY, IM_PAYLOAD_AGENT_SLOT_KEY } from '../src/im/agent-slot-constants';

describe('formatImClaimRunningMessage', () => {
  it('names agent slot from payload', () => {
    const msg = formatImClaimRunningMessage({
      event: { payload: { [IM_PAYLOAD_AGENT_SLOT_KEY]: 2 } },
    });
    expect(msg).toBe('**Agent #2** on your executor is running this task.');
  });

  it('defaults to agent #1 when slot missing', () => {
    expect(formatImClaimRunningMessage({ event: { payload: {} } })).toBe(
      '**Agent #1** on your executor is running this task.',
    );
    expect(formatImClaimRunningMessage(undefined)).toBe(
      '**Agent #1** on your executor is running this task.',
    );
  });

  it('uses /agent wording for agent control ops', () => {
    expect(
      formatImClaimRunningMessage({
        event: { payload: { [IM_PAYLOAD_AGENT_OP_KEY]: 'list' } },
      }),
    ).toBe('Your executor is running this **/agent** request.');
    expect(
      formatImClaimRunningMessage({
        event: { payload: { [IM_PAYLOAD_AGENT_OP_KEY]: 'create' } },
      }),
    ).toBe('Your executor is running this **/agent** request.');
    expect(
      formatImClaimRunningMessage({
        event: { payload: { [IM_PAYLOAD_AGENT_OP_KEY]: 'delete', [IM_PAYLOAD_AGENT_SLOT_KEY]: 2 } },
      }),
    ).toBe('Your executor is running this **/agent** request.');
  });
});

describe('formatImClaimQueuedMessage', () => {
  it('names agent slot from payload', () => {
    expect(
      formatImClaimQueuedMessage({
        event: { payload: { [IM_PAYLOAD_AGENT_SLOT_KEY]: 2 } },
      }),
    ).toBe(
      '**Agent #2** on your executor has **queued** this task — it will start when the current run on this slot finishes.',
    );
  });

  it('defaults to agent #1 when slot missing', () => {
    expect(formatImClaimQueuedMessage({ event: { payload: {} } })).toBe(
      '**Agent #1** on your executor has **queued** this task — it will start when the current run on this slot finishes.',
    );
  });

  it('uses /agent wording for agent control ops', () => {
    expect(
      formatImClaimQueuedMessage({
        event: { payload: { [IM_PAYLOAD_AGENT_OP_KEY]: 'list' } },
      }),
    ).toBe(
      'Your executor has **queued** this **/agent** request — it will run when the slot is free.',
    );
  });
});
