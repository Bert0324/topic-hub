import { TimelineActionType } from '../src/common/enums';
import {
  formatImHistoryReply,
  formatImShowTopicReply,
  formatImTimelineReply,
} from '../src/im/im-topic-read-replies';

describe('im-topic-read-replies', () => {
  it('formatImShowTopicReply includes title, status, id', () => {
    const md = formatImShowTopicReply({
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      type: 'bug',
      title: 'Login fails',
      status: 'open',
      createdBy: 'u1',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      assignees: ['alice'],
      tags: ['p0'],
    });
    expect(md).toContain('## Active topic');
    expect(md).toContain('Login fails');
    expect(md).toContain('**Status:**');
    expect(md).toContain('open');
    expect(md).toContain('507f1f77bcf86cd799439011');
    expect(md).toContain('alice');
    expect(md).toContain('p0');
    expect(md).toContain('no local executor');
  });

  it('formatImTimelineReply lists entries and pagination', () => {
    const md = formatImTimelineReply({
      entries: [
        {
          actionType: TimelineActionType.CREATED,
          actor: 'u1',
          timestamp: new Date('2026-01-01T12:00:00.000Z'),
          payload: { title: 'T', type: 'bug' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    expect(md).toContain('## Topic timeline');
    expect(md).toContain('created');
    expect(md).toContain('u1');
    expect(md).toContain('no local executor');
  });

  it('formatImTimelineReply empty state', () => {
    const md = formatImTimelineReply({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
    expect(md).toContain('No timeline entries');
  });

  it('formatImHistoryReply lists topics', () => {
    const md = formatImHistoryReply([
      {
        _id: { toString: () => 'aaa' },
        title: 'Old',
        status: 'closed',
        type: 'bug',
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
      },
    ]);
    expect(md).toContain('## Topics in this group');
    expect(md).toContain('Old');
    expect(md).toContain('closed');
    expect(md).toContain('Newest first');
  });
});
