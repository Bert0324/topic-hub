import { SkillsHandler } from '../src/command/handlers/skills.handler';
import type { SkillCenterService } from '../src/services/skill-center.service';
import type { CommandContext } from '../src/command/command-router';

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function baseContext(over: Partial<CommandContext> = {}): CommandContext {
  return {
    platform: 'discord',
    groupId: 'g1',
    userId: 'u1',
    hasActiveTopic: true,
    dispatchMeta: { targetUserId: '507f1f77bcf86cd799439011', targetExecutorToken: 't', sourceChannel: 'c', sourcePlatform: 'p' },
    ...over,
  };
}

describe('SkillsHandler (IM)', () => {
  it('list: calls listCatalog with IM-clamped limit and returns markdown', async () => {
    const listCatalog = jest.fn().mockResolvedValue({
      skills: [
        {
          name: 'demo-skill',
          version: '1.0.0',
          likeCount: 2,
          usageCount: 5,
          authorDisplayName: 'Ada',
        },
      ],
      total: 1,
      page: 1,
      limit: 12,
    });
    const skillCenter = { listCatalog, toggleLike: jest.fn() } as unknown as SkillCenterService;
    const h = new SkillsHandler(skillCenter, logger as any);

    const res = await h.execute(
      { action: 'skills', type: 'list', args: { limit: '99', page: '1', sort: 'recent' } },
      baseContext(),
    );

    expect(listCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, sort: 'recent' }),
    );
    expect(res.success).toBe(true);
    expect(String(res.message)).toContain('demo-skill');
    expect(String(res.message)).toContain('Ada');
  });

  it('star: parses skill name from imChatLine and toggles like', async () => {
    const toggleLike = jest.fn().mockResolvedValue({ liked: true, likeCount: 3 });
    const skillCenter = { listCatalog: jest.fn(), toggleLike } as unknown as SkillCenterService;
    const h = new SkillsHandler(skillCenter, logger as any);

    const res = await h.execute(
      { action: 'skills', type: 'star', args: {} },
      baseContext({ imChatLine: '/skills star my-skill' }),
    );

    expect(toggleLike).toHaveBeenCalledWith('my-skill', '507f1f77bcf86cd799439011');
    expect(res.success).toBe(true);
    expect(String(res.message)).toContain('Liked');
    expect(String(res.message)).toContain('my-skill');
  });

  it('star: fails when identity missing', async () => {
    const skillCenter = {
      listCatalog: jest.fn(),
      toggleLike: jest.fn(),
    } as unknown as SkillCenterService;
    const h = new SkillsHandler(skillCenter, logger as any);

    const res = await h.execute(
      { action: 'skills', type: 'star', args: {} },
      baseContext({ dispatchMeta: undefined }),
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, error: expect.stringMatching(/identity/) }),
    );
    expect(skillCenter.toggleLike).not.toHaveBeenCalled();
  });

  it('star: usage when no name on line', async () => {
    const skillCenter = { listCatalog: jest.fn(), toggleLike: jest.fn() } as unknown as SkillCenterService;
    const h = new SkillsHandler(skillCenter, logger as any);

    const res = await h.execute(
      { action: 'skills', type: 'star', args: {} },
      baseContext({ imChatLine: '/skills star' }),
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, error: expect.stringMatching(/Usage/) }),
    );
    expect(skillCenter.toggleLike).not.toHaveBeenCalled();
  });
});
