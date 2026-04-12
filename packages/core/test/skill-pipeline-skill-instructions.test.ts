import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { SkillRegistration } from '../src/entities/skill-registration.entity';
import type { SkillRegistry } from '../src/skill/registry/skill-registry';
import { SkillMdParser } from '../src/skill/registry/skill-md-parser';
import { SkillPipeline } from '../src/skill/pipeline/skill-pipeline';
import { DispatchEventType } from '../src/common/enums';

const SKILL_RAW = `---
name: remote-only-skill
description: Remote published skill for test
---

# Body

You must say REMOTE_OK.
`;

describe('SkillPipeline skillInstructions (server B)', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let regModel: any;
  let parser: SkillMdParser;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    regModel = getModelForClass(SkillRegistration, { existingConnection: connection });
    parser = new SkillMdParser({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any);
  }, 30000);

  afterAll(async () => {
    await connection.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await regModel.deleteMany({});
  });

  it('injects skillInstructions from Mongo when skill is not in registry cache', async () => {
    await regModel.create({
      name: 'remote-only-skill',
      version: '1.0.0',
      modulePath: 'published://remote-only-skill',
      metadata: {},
      publishedContent: {
        manifest: {},
        skillMdRaw: SKILL_RAW,
        entryPoint: '',
        files: {},
      },
    });

    const registry = {
      getSkillMd: jest.fn(() => undefined),
    } as unknown as SkillRegistry;

    const creates: unknown[] = [];
    const dispatchService = {
      create: jest.fn(async (dto: unknown) => {
        creates.push(dto);
        return { _id: new mongoose.Types.ObjectId() };
      }),
    };

    const pipeline = new SkillPipeline(
      registry,
      dispatchService as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
      null,
      parser,
      regModel as any,
    );

    const topicId = new mongoose.Types.ObjectId();
    await pipeline.execute(
      DispatchEventType.SKILL_INVOCATION,
      {
        _id: topicId,
        type: 'chat',
        title: 'T',
        status: 'open',
        groups: [],
        assignees: [],
        metadata: {},
        tags: [],
        signals: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'u',
      { skillName: 'remote-only-skill' },
      {
        targetUserId: 'id-1',
        targetExecutorToken: 'tok',
        sourceChannel: 'ch',
        sourcePlatform: 'feishu',
      },
      { dispatchSkillName: 'remote-only-skill' },
    );

    expect(dispatchService.create).toHaveBeenCalled();
    const row = creates[0] as { enrichedPayload: { skillInstructions: { primaryInstruction: string; frontmatter: { name: string } } } };
    expect(row.enrichedPayload.skillInstructions).toBeDefined();
    expect(row.enrichedPayload.skillInstructions.primaryInstruction).toContain('REMOTE_OK');
    expect(row.enrichedPayload.skillInstructions.frontmatter.name).toBe('remote-only-skill');
  });
});
