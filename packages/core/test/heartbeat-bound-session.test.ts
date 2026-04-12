import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { ExecutorHeartbeat } from '../src/entities/executor-heartbeat.entity';
import { HeartbeatService } from '../src/services/heartbeat.service';

describe('HeartbeatService.isBoundExecutorSessionLive', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let svc: HeartbeatService;
  let Model: mongoose.Model<any>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    Model = getModelForClass(ExecutorHeartbeat, { existingConnection: connection });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    svc = new HeartbeatService(Model, logger as any);
  }, 30000);

  afterAll(async () => {
    await connection.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await Model.deleteMany({});
  });

  it('returns true when heartbeat is fresh and claimToken matches bound token', async () => {
    await Model.create({
      topichubUserId: 'user-1',
      claimToken: 'token-a',
      lastSeenAt: new Date(),
    });
    await expect(svc.isBoundExecutorSessionLive('user-1', 'token-a')).resolves.toBe(true);
  });

  it('returns false when claimToken does not match heartbeat row (wrong local session)', async () => {
    await Model.create({
      topichubUserId: 'user-1',
      claimToken: 'token-a',
      lastSeenAt: new Date(),
    });
    await expect(svc.isBoundExecutorSessionLive('user-1', 'token-b')).resolves.toBe(false);
  });
});
