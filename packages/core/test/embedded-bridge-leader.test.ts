import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EmbeddedBridgeCluster } from '../src/bridge/embedded-bridge-leader';
import { defaultLoggerFactory } from '../src/common/logger';

describe('EmbeddedBridgeCluster', () => {
  let mongod: MongoMemoryServer;
  let uri: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('elects exactly one leader and shares the webhook secret', async () => {
    const conn = mongoose.createConnection(uri);
    await conn.asPromise();
    const coll = 'test_bridge_embedded_leader';
    const log = defaultLoggerFactory('test');
    const a = new EmbeddedBridgeCluster(conn, coll, log);
    const b = new EmbeddedBridgeCluster(conn, coll, log);
    const [ra, rb] = await Promise.all([a.join(), b.join()]);

    expect(ra.webhookSecret).toBe(rb.webhookSecret);
    expect(ra.isLeader === true || rb.isLeader === true).toBe(true);
    expect(ra.isLeader === false || rb.isLeader === false).toBe(true);
    expect(ra.isLeader === rb.isLeader).toBe(false);

    await Promise.all([ra.postGatewayShutdown(), rb.postGatewayShutdown()]);
    await conn.close();
  });
});
