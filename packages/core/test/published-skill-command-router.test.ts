import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { SkillRegistration } from '../src/entities/skill-registration.entity';
import { CommandRouter } from '../src/command/command-router';
import { PublishedSkillCatalog } from '../src/services/published-skill-catalog';
import { createCompositeSkillCommandMatcher } from '../src/command/composite-skill-command-matcher';

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('Published skill command router', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let SkillModel: any;
  let catalog: PublishedSkillCatalog;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    SkillModel = getModelForClass(SkillRegistration, { existingConnection: connection });
    catalog = new PublishedSkillCatalog(SkillModel, logger as any);
  }, 30000);

  afterAll(async () => {
    await connection.close();
    if (mongod) await mongod.stop();
  });

  function routerWithDisk(disk: (t: string) => string | undefined) {
    return new CommandRouter(createCompositeSkillCommandMatcher(catalog, disk));
  }

  beforeEach(async () => {
    await SkillModel.deleteMany({});
    catalog.invalidate();
  });

  it('routes published-only name to skill_invoke with canonical casing from DB', async () => {
    await SkillModel.create({
      name: 'PubOnlySkill',
      version: '1.0.0',
      modulePath: 'published://pubonlyskill',
      metadata: {},
      publishedContent: {
        manifest: {},
        skillMdRaw: '---\nname: PubOnlySkill\n---\n',
        entryPoint: '',
        files: {},
      },
    });
    await catalog.refresh();
    const router = routerWithDisk(() => undefined);
    const route = router.route(
      { action: 'pubonlyskill', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: true, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('skill_invoke');
    expect(route.skillInvocationName).toBe('PubOnlySkill');
  });

  it('published catalog wins over disk registry for the same token (R2)', async () => {
    await SkillModel.create({
      name: 'SharedName',
      version: '1.0.0',
      modulePath: 'published://shared',
      metadata: {},
      publishedContent: {
        manifest: {},
        skillMdRaw: '---\n---\n',
        entryPoint: '',
        files: {},
      },
    });
    await catalog.refresh();
    const router = routerWithDisk((t) => (t === 'sharedname' ? 'DiskCanonical' : undefined));
    const route = router.route(
      { action: 'sharedname', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: true, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('skill_invoke');
    expect(route.skillInvocationName).toBe('SharedName');
  });

  it('falls back to disk when name is not published', async () => {
    await catalog.refresh();
    const router = routerWithDisk((t) => (t === 'diskonly' ? 'DiskOnly' : undefined));
    const route = router.route(
      { action: 'diskonly', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: true, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('skill_invoke');
    expect(route.skillInvocationName).toBe('DiskOnly');
  });

  it('relay for unknown slash token includes publishedSkillMissToken', async () => {
    await catalog.refresh();
    const router = routerWithDisk(() => undefined);
    const route = router.route(
      { action: 'notaskill', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: true, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('relay');
    expect(route.publishedSkillMissToken).toBe('notaskill');
  });

  it('global built-in wins before published skill name branch', async () => {
    await SkillModel.create({
      name: 'create',
      version: '1.0.0',
      modulePath: 'published://create',
      metadata: {},
      publishedContent: {
        manifest: {},
        skillMdRaw: '---\n---\n',
        entryPoint: '',
        files: {},
      },
    });
    await catalog.refresh();
    const router = routerWithDisk(() => undefined);
    const route = router.route(
      { action: 'create', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: false, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('create');
    expect(route.skillInvocationName).toBeUndefined();
  });

  it('routes /skills list globally (not skill_invoke) even when a published skill is named skills', async () => {
    await SkillModel.create({
      name: 'skills',
      version: '1.0.0',
      modulePath: 'published://skills',
      metadata: {},
      publishedContent: {
        manifest: {},
        skillMdRaw: '---\n---\n',
        entryPoint: '',
        files: {},
      },
    });
    await catalog.refresh();
    const router = routerWithDisk(() => undefined);
    const route = router.route(
      { action: 'skills', type: 'list', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: true, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('skills');
    expect(route.error).toBeUndefined();
  });

  it('returns usage error for /skills without valid subcommand', async () => {
    await catalog.refresh();
    const router = routerWithDisk(() => undefined);
    const route = router.route(
      { action: 'skills', args: {} },
      { platform: 'p', groupId: 'g', userId: 'u', hasActiveTopic: false, imCommandUsedSlash: true },
    );
    expect(route.handler).toBe('skills');
    expect(route.error).toMatch(/Usage:/);
  });
});
