import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { TaskDispatch } from '../src/entities/task-dispatch.entity';
import { DispatchService } from '../src/services/dispatch.service';
import { DispatchEventType } from '../src/common/enums';
import { IM_PAYLOAD_AGENT_SLOT_KEY } from '../src/im/agent-slot-constants';

describe('DispatchService agentSlot in enrichedPayload', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let dispatchService: DispatchService;
  let DispatchModel: mongoose.Model<any>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    DispatchModel = getModelForClass(TaskDispatch, { existingConnection: connection });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    dispatchService = new DispatchService(DispatchModel, logger as any);
    dispatchService.init();
  }, 30000);

  afterAll(async () => {
    dispatchService.destroy();
    await connection.close();
    if (mongod) await mongod.stop();
  });

  it('persists agentSlot inside event.payload', async () => {
    const topicId = new mongoose.Types.ObjectId().toString();
    const now = new Date().toISOString();
    const enrichedPayload = {
      topic: {
        id: topicId,
        type: 't',
        title: 'T',
        status: 'open',
        metadata: {},
        groups: [],
        assignees: [],
        tags: [],
        signals: [],
        createdAt: now,
        updatedAt: now,
      },
      event: {
        type: DispatchEventType.USER_MESSAGE,
        actor: 'u1',
        timestamp: new Date(),
        payload: { text: 'hi', [IM_PAYLOAD_AGENT_SLOT_KEY]: 2 },
      },
    };
    const created = await dispatchService.create({
      topicId,
      eventType: DispatchEventType.USER_MESSAGE,
      skillName: 'relay',
      enrichedPayload,
      targetUserId: 'id1',
      targetExecutorToken: 'tok1',
      sourceChannel: 'ch1',
      sourcePlatform: 'feishu',
    });
    const row = await DispatchModel.findById(created._id).lean().exec();
    const slot = (row as any)?.enrichedPayload?.event?.payload?.[IM_PAYLOAD_AGENT_SLOT_KEY];
    expect(slot).toBe(2);
  });
});
