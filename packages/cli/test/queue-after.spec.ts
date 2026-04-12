/// <reference types="jest" />

import { anchorStatusAllowsQueuedWork, getQueueAfterDispatchId } from '../src/commands/serve/queue-after';
import type { DispatchEvent } from '../src/commands/serve/event-consumer';

describe('getQueueAfterDispatchId', () => {
  it('returns undefined when missing', () => {
    expect(getQueueAfterDispatchId({ topicId: 'x', eventType: 'user_message', skillName: 's', createdAt: '' })).toBeUndefined();
  });

  it('reads queueAfterDispatchId from enrichedPayload.event.payload', () => {
    const ev: DispatchEvent = {
      topicId: 't',
      eventType: 'user_message',
      skillName: 's',
      createdAt: '',
      enrichedPayload: {
        event: { payload: { text: 'hi', queueAfterDispatchId: ' 507f1f77bcf86cd799439011 ' } },
      },
    };
    expect(getQueueAfterDispatchId(ev)).toBe('507f1f77bcf86cd799439011');
  });
});

describe('anchorStatusAllowsQueuedWork', () => {
  it('is false only for claimed', () => {
    expect(anchorStatusAllowsQueuedWork('claimed')).toBe(false);
    expect(anchorStatusAllowsQueuedWork('unclaimed')).toBe(true);
    expect(anchorStatusAllowsQueuedWork('completed')).toBe(true);
    expect(anchorStatusAllowsQueuedWork('failed')).toBe(true);
    expect(anchorStatusAllowsQueuedWork('suspended')).toBe(true);
  });
});
