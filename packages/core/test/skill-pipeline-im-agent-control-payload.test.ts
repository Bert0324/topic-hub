import mongoose from 'mongoose';
import { SkillPipeline } from '../src/skill/pipeline/skill-pipeline';
import { DispatchEventType } from '../src/common/enums';
import { IM_ENRICHED_ROOT_AGENT_OP_KEY, IM_PAYLOAD_AGENT_OP_KEY } from '../src/im/agent-slot-constants';

describe('SkillPipeline IM /agent control dispatch payload', () => {
  it('duplicates topichubAgentOp onto enrichedPayload root for resilient persistence', async () => {
    const creates: unknown[] = [];
    const dispatchService = {
      create: jest.fn(async (dto: unknown) => {
        creates.push(dto);
        return { _id: new mongoose.Types.ObjectId() };
      }),
    };

    const pipeline = new SkillPipeline(
      { getSkillMd: jest.fn(() => undefined) } as any,
      dispatchService as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
      () => null,
      undefined,
      undefined,
    );

    const topicId = new mongoose.Types.ObjectId();
    await pipeline.execute(
      DispatchEventType.USER_MESSAGE,
      {
        _id: topicId,
        type: 'chat',
        title: 'test topic',
        status: 'open',
        groups: [],
        assignees: [],
        metadata: {},
        tags: [],
        signals: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'u1',
      { [IM_PAYLOAD_AGENT_OP_KEY]: 'list' },
      {
        targetUserId: 'id-1',
        targetExecutorToken: 'tok',
        sourceChannel: 'ch',
        sourcePlatform: 'feishu',
      },
      { dispatchSkillName: 'topichub-im-agent' },
    );

    expect(dispatchService.create).toHaveBeenCalled();
    const row = creates[0] as { enrichedPayload: Record<string, unknown>; imAgentControlOp?: string };
    expect(row.imAgentControlOp).toBe('list');
    const ep = row.enrichedPayload;
    expect(ep[IM_ENRICHED_ROOT_AGENT_OP_KEY]).toBe('list');
    const nested = (ep.event as { payload: Record<string, unknown> }).payload;
    expect(nested[IM_PAYLOAD_AGENT_OP_KEY]).toBe('list');
  });
});
