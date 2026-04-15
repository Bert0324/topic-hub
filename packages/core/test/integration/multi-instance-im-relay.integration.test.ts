/**
 * Simulates production-style **multi-process** behavior against one MongoDB:
 * - embedded bridge lease (leader + follower share `webhookSecret`)
 * - IM dispatch `imAgentControlOp` survives stripped `enrichedPayload` (claim path)
 * - relay-shaped OpenClaw webhook HMAC when the host re-stringifies JSON (GuluX-style)
 *
 * Default: in-memory Mongo (CI-safe).
 * Optional: `TOPICHUB_INTEGRATION_MONGO_URI=mongodb://...` to hit BOE/shared ByteDoc (read-only
 * lease collection name is unique per run to avoid clashing with real `bridge_embedded_leader`).
 */
import * as crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getModelForClass } from '@typegoose/typegoose';
import { EmbeddedBridgeCluster } from '../../src/bridge/embedded-bridge-leader';
import { OpenClawBridge } from '../../src/bridge/openclaw-bridge';
import { defaultLoggerFactory } from '../../src/common/logger';
import { TaskDispatch } from '../../src/entities/task-dispatch.entity';
import { DispatchService } from '../../src/services/dispatch.service';
import { DispatchEventType } from '../../src/common/enums';
import { IM_ENRICHED_ROOT_AGENT_OP_KEY, IM_PAYLOAD_AGENT_OP_KEY } from '../../src/im/agent-slot-constants';
import { resolveImAgentControlOp } from '../../src/im/im-agent-control-dispatch';

describe('integration: multi-instance lease + IM relay + dispatch', () => {
  let mongod: MongoMemoryServer | undefined;
  let uri: string;
  const leaseColl = `test_embed_lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    const external = process.env.TOPICHUB_INTEGRATION_MONGO_URI?.trim();
    if (external) {
      uri = external;
      return;
    }
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }, 120_000);

  afterAll(async () => {
    if (mongod) await mongod.stop();
  });

  it('elects one embedded bridge leader and one follower with the same webhook secret', async () => {
    const conn = mongoose.createConnection(uri);
    await conn.asPromise();
    const log = defaultLoggerFactory('integration-embed');
    const a = new EmbeddedBridgeCluster(conn, leaseColl, log);
    const b = new EmbeddedBridgeCluster(conn, leaseColl, log);
    const [ra, rb] = await Promise.all([a.join(), b.join()]);
    expect(ra.webhookSecret).toBe(rb.webhookSecret);
    expect(ra.isLeader).not.toBe(rb.isLeader);
    await Promise.all([ra.postGatewayShutdown(), rb.postGatewayShutdown()]);
    await conn.close();
  });

  it('persists imAgentControlOp on TaskDispatch and resolveImAgentControlOp survives stripped enrichedPayload after claim', async () => {
    const conn = mongoose.createConnection(uri);
    await conn.asPromise();
    const p = `smoke_dispatch_${Date.now().toString(36)}_`;
    const DispatchModel = getModelForClass(TaskDispatch, {
      existingConnection: conn,
      schemaOptions: { collection: `${p}task_dispatches` },
    });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const dispatchService = new DispatchService(DispatchModel, logger as any);
    dispatchService.init();

    const topicId = new mongoose.Types.ObjectId().toString();
    const now = new Date().toISOString();
    const enrichedPayload = {
      topic: {
        id: topicId,
        type: 'chat',
        title: 't',
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
        payload: { [IM_PAYLOAD_AGENT_OP_KEY]: 'list' },
      },
      [IM_ENRICHED_ROOT_AGENT_OP_KEY]: 'list' as const,
    };

    const created = await dispatchService.create({
      topicId,
      eventType: DispatchEventType.USER_MESSAGE,
      skillName: 'topichub-im-agent',
      enrichedPayload,
      imAgentControlOp: 'list',
      targetUserId: 'id1',
      targetExecutorToken: 'eth_test',
      sourceChannel: 'user:x',
      sourcePlatform: 'feishu',
    });

    const lean = await DispatchModel.findById(created._id).lean().exec() as {
      imAgentControlOp?: string;
      enrichedPayload?: unknown;
    } | null;
    expect(lean?.imAgentControlOp).toBe('list');

    const strippedClaim = {
      imAgentControlOp: lean?.imAgentControlOp,
      enrichedPayload: {
        topic: (lean!.enrichedPayload as { topic: unknown }).topic,
        event: { type: 'user_message', actor: 'u1', timestamp: new Date(), payload: {} },
      },
    };

    const op = resolveImAgentControlOp(lean as any, strippedClaim as any);
    expect(op).toBe('list');

    dispatchService.destroy();
    await conn.close();
  });

  it('accepts X-TopicHub-Signature when POST body was re-stringified (relay vs GuluX)', () => {
    const secret = 'integration-relay-secret';
    const bridge = OpenClawBridge.forEmbeddedGateway({
      gatewayBaseUrl: 'http://127.0.0.1:9/openclaw',
      webhookSecret: secret,
      platforms: ['feishu'],
      logger: defaultLoggerFactory('integration-openclaw'),
    });

    const body = {
      event: 'message.received',
      timestamp: '2026-04-15T12:00:00.000Z',
      data: {
        channel: 'user:ou_test',
        user: 'ou_test',
        message: '/help',
        sessionId: 'agent:main:feishu:dm:ou_test',
        platform: 'feishu',
        isDm: true,
      },
    };
    const bodyStr = JSON.stringify(body);
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')}`;

    const reordered = JSON.stringify({
      event: body.event,
      timestamp: body.timestamp,
      data: {
        user: body.data.user,
        channel: body.data.channel,
        message: body.data.message,
        sessionId: body.data.sessionId,
        platform: body.data.platform,
        isDm: body.data.isDm,
      },
    });

    const inbound = bridge.handleInboundWebhook(body, reordered, {
      'x-topichub-signature': sig,
    });
    expect(inbound).not.toBeNull();
    expect(inbound?.rawCommand).toBe('/help');
  });
});
