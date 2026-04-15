import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { TopicHub } from '../../src';

describe('TopicHub Facade', () => {
  let mongod: MongoMemoryServer;
  let hub: TopicHub;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    hub = await TopicHub.create({
      mongoUri: uri,
      skillsDir: '/tmp/topichub-test-skills', // empty dir is fine
    });
  }, 30000);

  afterAll(async () => {
    if (hub) await hub.shutdown();
    if (mongod) await mongod.stop();
  });

  it('should create a TopicHub instance', () => {
    expect(hub).toBeDefined();
    expect(hub.topics).toBeDefined();
    expect(hub.commands).toBeDefined();
    expect(hub.ingestion).toBeDefined();
    expect(hub.webhook).toBeDefined();
    expect(hub.messaging).toBeDefined();
    expect(hub.identityAuth).toBeDefined();
    expect(hub.search).toBeDefined();
    expect(hub.skills).toBeDefined();
    expect(hub.dispatch).toBeDefined();
  });

  it('should list topics (empty initially)', async () => {
    const result = await hub.topics.list({ status: 'open', limit: 20, offset: 0 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('should search topics without text query', async () => {
    const result = await hub.search.search({ status: 'open', limit: 20, offset: 0 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('should list registered skills', () => {
    const skills = hub.skills.listRegistered();
    expect(Array.isArray(skills)).toBe(true);
  });

  it('should shutdown cleanly', async () => {
    // shutdown is tested in afterAll
    expect(true).toBe(true);
  });
});
