import { RelayHandler } from '../src/command/handlers/relay.handler';
import { SkillInvokeHandler } from '../src/command/handlers/skill-invoke.handler';
import { DispatchEventType } from '../src/common/enums';

describe('IM relay and skill_invoke payloads', () => {
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

  it('RelayHandler uses imTargetAgentSlot over stripLeading #N', async () => {
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
    const topicService = { async findActiveTopicByGroup() { return topic; } };
    const relay = new RelayHandler(topicService as any, skillPipeline as any, console as any);
    await relay.execute({} as any, {
      platform: 'p',
      groupId: 'g',
      userId: 'u1',
      hasActiveTopic: true,
      imChatLine: '#3 hello',
      imTargetAgentSlot: 2,
      dispatchMeta: { targetUserId: 'x', targetExecutorToken: 'tok' },
    });
    expect((calls[0] as any).extra.text).toBe('hello');
    expect((calls[0] as any).extra.agentSlot).toBe(2);
  });

  it('SkillInvokeHandler uses imTargetAgentSlot over slash line #N', async () => {
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
    const topicService = { async findActiveTopicByGroup() { return topic; } };
    const h = new SkillInvokeHandler(topicService as any, skillPipeline as any, console as any);
    await h.execute({ args: {}, type: undefined } as any, {
      platform: 'p',
      groupId: 'g',
      userId: 'u1',
      hasActiveTopic: true,
      skillInvocationName: 'my-skill',
      imChatLine: '/my-skill #5 tail',
      imTargetAgentSlot: 2,
      dispatchMeta: { targetUserId: 'x', targetExecutorToken: 'tok' },
    });
    expect((calls[0] as any).extra.imText).toBe('/my-skill tail');
    expect((calls[0] as any).extra.agentSlot).toBe(2);
  });
});
