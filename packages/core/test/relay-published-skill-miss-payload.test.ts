import mongoose from 'mongoose';
import { SkillPipeline } from '../src/skill/pipeline/skill-pipeline';
import { DispatchEventType } from '../src/common/enums';

describe('Relay published skill routing payload', () => {
  it('persists publishedSkillRouting miss under enrichedPayload.event.payload', async () => {
    const created: unknown[] = [];
    const dispatchService = {
      create: jest.fn(async (doc: unknown) => {
        created.push(doc);
        return { _id: new mongoose.Types.ObjectId(), ...(doc as object) };
      }),
    };
    const pipeline = new SkillPipeline(
      {} as any,
      dispatchService as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
      () => null,
    );
    const topicId = new mongoose.Types.ObjectId();
    const topic = {
      _id: topicId,
      type: 'test',
      title: 'T',
      status: 'open',
      metadata: {},
      groups: [],
      assignees: [],
      tags: [],
      signals: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await pipeline.execute(
      DispatchEventType.USER_MESSAGE,
      topic,
      'actor-1',
      {
        text: '/nope arg',
        publishedSkillRouting: { status: 'miss', token: 'nope' },
      },
      {
        targetUserId: 'u1',
        targetExecutorToken: 'exec-one',
        sourceChannel: 'chan',
        sourcePlatform: 'plat',
      },
    );
    expect(dispatchService.create).toHaveBeenCalled();
    const row = created[0] as {
      enrichedPayload: { event: { payload: Record<string, unknown> } };
    };
    const payload = row.enrichedPayload.event.payload;
    expect(payload.text).toBe('/nope arg');
    expect(payload.publishedSkillRouting).toEqual({ status: 'miss', token: 'nope' });
  });
});
