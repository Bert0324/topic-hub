import { SkillAiRuntime } from '../../src/skill/pipeline/skill-ai-runtime';
import { SkillRegistry } from '../../src/skill/registry/skill-registry';
import { AiService } from '../../src/ai/ai.service';
import { TimelineActionType } from '../../src/common/enums';
import { ParsedSkillMd } from '../../src/skill/interfaces/skill-md';

describe('SkillAiRuntime', () => {
  let runtime: SkillAiRuntime;
  let mockRegistry: jest.Mocked<Pick<SkillRegistry, 'getSkillMd'>>;
  let mockAiService: jest.Mocked<Pick<AiService, 'complete'>>;
  let mockTimelineModel: any;
  let mockTopicModel: any;

  const tenantId = 'tenant-1';
  const skillName = 'test-skill';
  const topicData = {
    _id: 'topic-123',
    tenantId: 'tenant-1',
    type: 'alert',
    title: 'Test Alert',
    status: 'open',
    metadata: { severity: 'high' },
    createdBy: 'user-1',
    groups: [],
    assignees: [],
    tags: ['urgent'],
    signals: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const validParsedMd: ParsedSkillMd = {
    frontmatter: { name: 'test-skill', description: 'Test' },
    systemPrompt: 'Analyze the topic.',
    eventPrompts: new Map([['onTopicCreated', 'Full assessment on creation.']]),
    hasAiInstructions: true,
  };

  const mockAiResponse = {
    id: 'resp-1',
    model: 'doubao-seed',
    content: '**Assessment**: Critical\n**Priority**: High',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  };

  beforeEach(() => {
    mockRegistry = { getSkillMd: jest.fn() };
    mockAiService = { complete: jest.fn() };
    mockTimelineModel = { create: jest.fn().mockResolvedValue({}) };
    mockTopicModel = { updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }) };

    runtime = new SkillAiRuntime(
      mockRegistry as any,
      mockAiService as any,
      mockTimelineModel,
      mockTopicModel,
    );
  });

  it('should create timeline entry and update metadata when AI returns response', async () => {
    mockRegistry.getSkillMd.mockReturnValue(validParsedMd);
    mockAiService.complete.mockResolvedValue(mockAiResponse);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    expect(mockAiService.complete).toHaveBeenCalledTimes(1);
    expect(mockTimelineModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        topicId: 'topic-123',
        actor: `ai:${skillName}`,
        actionType: TimelineActionType.AI_RESPONSE,
      }),
    );
    expect(mockTopicModel.updateOne).toHaveBeenCalledWith(
      { _id: 'topic-123', tenantId },
      { $set: { [`metadata._ai.${skillName}`]: expect.objectContaining({ content: mockAiResponse.content }) } },
    );
  });

  it('should not create timeline entry when AI returns null', async () => {
    mockRegistry.getSkillMd.mockReturnValue(validParsedMd);
    mockAiService.complete.mockResolvedValue(null);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    expect(mockAiService.complete).toHaveBeenCalledTimes(1);
    expect(mockTimelineModel.create).not.toHaveBeenCalled();
    expect(mockTopicModel.updateOne).not.toHaveBeenCalled();
  });

  it('should select event-specific section when matching heading exists', async () => {
    mockRegistry.getSkillMd.mockReturnValue(validParsedMd);
    mockAiService.complete.mockResolvedValue(mockAiResponse);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    const callArgs = mockAiService.complete.mock.calls[0][0];
    const systemMsg = callArgs.input[0];
    expect(systemMsg.content[0].text).toBe('Full assessment on creation.');
  });

  it('should fall back to full body when no matching event section', async () => {
    mockRegistry.getSkillMd.mockReturnValue(validParsedMd);
    mockAiService.complete.mockResolvedValue(mockAiResponse);

    await runtime.executeIfApplicable(tenantId, skillName, 'assigned', topicData, 'user-1');

    const callArgs = mockAiService.complete.mock.calls[0][0];
    const systemMsg = callArgs.input[0];
    expect(systemMsg.content[0].text).toBe('Analyze the topic.');
  });

  it('should not call AI when skill has no AI instructions', async () => {
    const noInstructionsMd: ParsedSkillMd = {
      ...validParsedMd,
      hasAiInstructions: false,
      systemPrompt: '',
    };
    mockRegistry.getSkillMd.mockReturnValue(noInstructionsMd);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    expect(mockAiService.complete).not.toHaveBeenCalled();
  });

  it('should not call AI when skill has no SKILL.md', async () => {
    mockRegistry.getSkillMd.mockReturnValue(null);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    expect(mockAiService.complete).not.toHaveBeenCalled();
  });

  it('should construct system prompt from SKILL.md and user prompt from topic snapshot', async () => {
    mockRegistry.getSkillMd.mockReturnValue(validParsedMd);
    mockAiService.complete.mockResolvedValue(mockAiResponse);

    await runtime.executeIfApplicable(tenantId, skillName, 'created', topicData, 'user-1');

    const callArgs = mockAiService.complete.mock.calls[0][0];
    expect(callArgs.input).toHaveLength(2);
    expect(callArgs.input[0].role).toBe('system');
    expect(callArgs.input[1].role).toBe('user');

    const userContent = JSON.parse(callArgs.input[1].content[0].text);
    expect(userContent.topic._id).toBe('topic-123');
    expect(userContent.topic.title).toBe('Test Alert');
    expect(userContent.event.eventType).toBe('onTopicCreated');
    expect(userContent.event.actor).toBe('user-1');
  });
});
