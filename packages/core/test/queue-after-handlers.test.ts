import { RelayHandler } from '../src/command/handlers/relay.handler';
import { SkillInvokeHandler } from '../src/command/handlers/skill-invoke.handler';
import { DispatchEventType } from '../src/common/enums';

describe('queueAfterDispatchId in IM handlers', () => {
  const topic = {
    _id: 'topic1',
    type: 'bug',
    title: 'T',
    status: 'open',
    metadata: {},
    groups: [{ platform: 'p', groupId: 'g' }],
    assignees: [],
    tags: [],
    signals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
  };

  it('RelayHandler passes queueAfterDispatchId into skill pipeline payload', async () => {
    const calls: unknown[] = [];
    const skillPipeline = {
      async execute(
        op: string,
        t: unknown,
        actor: string,
        extra: Record<string, unknown>,
      ) {
        calls.push({ op, t, actor, extra });
      },
    };
    const topicService = {
      async findActiveTopicByGroup() {
        return topic;
      },
    };
    const relay = new RelayHandler(topicService as any, skillPipeline as any, console as any);
    const res = await relay.execute({} as any, {
      platform: 'p',
      groupId: 'g',
      userId: 'u1',
      hasActiveTopic: true,
      imChatLine: 'hello',
      dispatchMeta: { targetUserId: 'x', targetExecutorToken: 'tok' },
      queueAfterDispatchId: 'anchor-id',
    });
    expect(res.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect((calls[0] as any).op).toBe(DispatchEventType.USER_MESSAGE);
    expect((calls[0] as any).extra.queueAfterDispatchId).toBe('anchor-id');
    expect((calls[0] as any).extra.text).toBe('hello');
  });

  it('SkillInvokeHandler passes queueAfterDispatchId into skill pipeline extra', async () => {
    const calls: unknown[] = [];
    const skillPipeline = {
      async execute(
        op: string,
        t: unknown,
        actor: string,
        extra: Record<string, unknown>,
        _meta: unknown,
        opts: { dispatchSkillName?: string },
      ) {
        calls.push({ op, extra, opts });
      },
    };
    const topicService = {
      async findActiveTopicByGroup() {
        return topic;
      },
    };
    const h = new SkillInvokeHandler(topicService as any, skillPipeline as any, console as any);
    const res = await h.execute({ args: {}, type: undefined } as any, {
      platform: 'p',
      groupId: 'g',
      userId: 'u1',
      hasActiveTopic: true,
      skillInvocationName: 'my-skill',
      imChatLine: '/my-skill x',
      dispatchMeta: { targetUserId: 'x', targetExecutorToken: 'tok' },
      queueAfterDispatchId: 'anchor2',
    });
    expect(res.success).toBe(true);
    expect((calls[0] as any).extra.queueAfterDispatchId).toBe('anchor2');
    expect((calls[0] as any).extra.skillName).toBe('my-skill');
  });
});
