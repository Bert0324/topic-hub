import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { Identity } from '../src/entities/identity.entity';
import { ImIdentityLink } from '../src/entities/im-identity-link.entity';
import { ImSelfServeIdentityService } from '../src/services/im-self-serve-identity.service';
import { ConflictError } from '../src/common/errors';

describe('ImSelfServeIdentityService', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let svc: ImSelfServeIdentityService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    const IdentityModel = getModelForClass(Identity, {
      existingConnection: connection,
    });
    const LinkModel = getModelForClass(ImIdentityLink, {
      existingConnection: connection,
    });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    svc = new ImSelfServeIdentityService(IdentityModel, LinkModel, logger as any);
  }, 30000);

  afterAll(async () => {
    await connection.close();
    if (mongod) await mongod.stop();
  });

  it('creates identity and link; getMe returns same token', async () => {
    const r = await svc.createFromIm({ platform: 'p1', platformUserId: 'u1', displayName: 'Alice' });
    expect(r.displayName).toBe('Alice');
    expect(r.token).toMatch(/^id_/);
    expect(r.uniqueId).toMatch(/^im_/);
    const me = await svc.getMeForIm({ platform: 'p1', platformUserId: 'u1' });
    expect(me?.token).toBe(r.token);
    expect(me?.uniqueId).toBe(r.uniqueId);
  });

  it('rejects duplicate create for same platform + platformUserId', async () => {
    await svc.createFromIm({ platform: 'p2', platformUserId: 'u2', displayName: 'B' });
    await expect(
      svc.createFromIm({ platform: 'p2', platformUserId: 'u2', displayName: 'B2' }),
    ).rejects.toThrow(ConflictError);
    const linkCount = await connection.collection('im_identity_links').countDocuments({
      platform: 'p2',
      platformUserId: 'u2',
    });
    expect(linkCount).toBe(1);
  });

  it('allows distinct platforms with same platformUserId string (multi-IM)', async () => {
    await svc.createFromIm({ platform: 'slack', platformUserId: 'same', displayName: 'S' });
    await svc.createFromIm({ platform: 'discord', platformUserId: 'same', displayName: 'D' });
    const a = await svc.getMeForIm({ platform: 'slack', platformUserId: 'same' });
    const b = await svc.getMeForIm({ platform: 'discord', platformUserId: 'same' });
    expect(a?.uniqueId).not.toBe(b?.uniqueId);
    expect(a?.displayName).toBe('S');
    expect(b?.displayName).toBe('D');
  });

  it('second create attempt does not add a second link row', async () => {
    await svc.createFromIm({ platform: 'px', platformUserId: 'race', displayName: 'R' });
    await expect(
      svc.createFromIm({ platform: 'px', platformUserId: 'race', displayName: 'R2' }),
    ).rejects.toThrow(/already registered/);
    expect(
      await connection.collection('im_identity_links').countDocuments({
        platform: 'px',
        platformUserId: 'race',
      }),
    ).toBe(1);
  });
});
