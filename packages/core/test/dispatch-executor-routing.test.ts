import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { TaskDispatch } from '../src/entities/task-dispatch.entity';
import { DispatchService } from '../src/services/dispatch.service';
import { DispatchEventType, DispatchStatus } from '../src/common/enums';

function minimalEnrichedPayload(topicId: string) {
  const now = new Date().toISOString();
  return {
    topic: {
      id: topicId,
      type: 'test',
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
      type: 'updated',
      actor: 'test',
      timestamp: new Date(),
    },
  };
}

describe('DispatchService executor-scoped routing', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let dispatchService: DispatchService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    const DispatchModel = getModelForClass(TaskDispatch, {
      existingConnection: connection,
    });
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    dispatchService = new DispatchService(DispatchModel, logger as any);
    dispatchService.init();
  }, 30000);

  afterAll(async () => {
    dispatchService.destroy();
    await connection.close();
    if (mongod) await mongod.stop();
  });

  it('findUnclaimed lists only dispatches for the given executor token', async () => {
    const topicId = new mongoose.Types.ObjectId().toString();
    await dispatchService.create({
      topicId,
      eventType: DispatchEventType.UPDATED,
      skillName: 's1',
      enrichedPayload: minimalEnrichedPayload(topicId),
      targetUserId: 'identity-1',
      targetExecutorToken: 'exec_alpha',
    });
    await dispatchService.create({
      topicId,
      eventType: DispatchEventType.UPDATED,
      skillName: 's2',
      enrichedPayload: minimalEnrichedPayload(topicId),
      targetUserId: 'identity-1',
      targetExecutorToken: 'exec_beta',
    });

    const forAlpha = await dispatchService.findUnclaimed({ executorToken: 'exec_alpha', limit: 20 });
    const forBeta = await dispatchService.findUnclaimed({ executorToken: 'exec_beta', limit: 20 });

    expect(forAlpha.length).toBe(1);
    expect(forAlpha[0].targetExecutorToken).toBe('exec_alpha');
    expect(forBeta.length).toBe(1);
    expect(forBeta[0].targetExecutorToken).toBe('exec_beta');
  });

  it('findUnclaimed without executorToken returns empty', async () => {
    const rows = await dispatchService.findUnclaimed({ limit: 20 });
    expect(rows).toEqual([]);
  });

  it('claim requires matching targetExecutorToken', async () => {
    const topicId = new mongoose.Types.ObjectId().toString();
    const d = await dispatchService.create({
      topicId,
      eventType: DispatchEventType.UPDATED,
      skillName: 's',
      enrichedPayload: minimalEnrichedPayload(topicId),
      targetUserId: 'identity-x',
      targetExecutorToken: 'exec_claim_test',
    });
    const id = d._id.toString();

    const wrong = await dispatchService.claim(id, 'cli:test', 'wrong_token');
    expect(wrong).toBeNull();

    const ok = await dispatchService.claim(id, 'cli:test', 'exec_claim_test');
    expect(ok).not.toBeNull();
    expect(ok.status).toBe(DispatchStatus.CLAIMED);
  });

  it('complete and fail require matching executor token', async () => {
    const topicId = new mongoose.Types.ObjectId().toString();
    const d = await dispatchService.create({
      topicId,
      eventType: DispatchEventType.UPDATED,
      skillName: 's',
      enrichedPayload: minimalEnrichedPayload(topicId),
      targetUserId: 'identity-y',
      targetExecutorToken: 'exec_complete_test',
    });
    const id = d._id.toString();
    await dispatchService.claim(id, 'cli', 'exec_complete_test');

    const badComplete = await dispatchService.complete(
      id,
      { text: 'x', executorType: 't', durationMs: 1 },
      'other_token',
    );
    expect(badComplete).toBeNull();

    const goodComplete = await dispatchService.complete(
      id,
      { text: 'done', executorType: 't', durationMs: 1 },
      'exec_complete_test',
    );
    expect(goodComplete).not.toBeNull();
    expect(goodComplete!.status).toBe(DispatchStatus.COMPLETED);

    const topicId2 = new mongoose.Types.ObjectId().toString();
    const d2 = await dispatchService.create({
      topicId: topicId2,
      eventType: DispatchEventType.UPDATED,
      skillName: 's',
      enrichedPayload: minimalEnrichedPayload(topicId2),
      targetUserId: 'identity-z',
      targetExecutorToken: 'exec_fail_test',
    });
    const id2 = d2._id.toString();
    await dispatchService.claim(id2, 'cli', 'exec_fail_test');

    const badFail = await dispatchService.fail(id2, 'oops', true, 'wrong');
    expect(badFail).toBeNull();

    const goodFail = await dispatchService.fail(id2, 'oops', false, 'exec_fail_test');
    expect(goodFail).not.toBeNull();
    expect(goodFail!.status).toBe(DispatchStatus.FAILED);
  });
});
