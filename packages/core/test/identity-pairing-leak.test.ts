import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { UserIdentityBinding } from '../src/entities/user-identity-binding.entity';
import { PairingCode } from '../src/identity/pairing-code.entity';
import { IdentityService } from '../src/identity/identity.service';

describe('IdentityService group leak pairing rotation', () => {
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;
  let identityService: IdentityService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();
    const BindingModel = getModelForClass(UserIdentityBinding, {
      existingConnection: connection,
    });
    const PairingModel = getModelForClass(PairingCode, {
      existingConnection: connection,
    });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    identityService = new IdentityService(BindingModel, PairingModel, logger as any);
  }, 30000);

  afterAll(async () => {
    await connection.close();
    if (mongod) await mongod.stop();
  });

  it('invalidateLeakedPairingCodeAndRotate marks code claimed and emits fresh code', async () => {
    const execToken = 'exec_token_leak_test';
    const userId = 'usr_leak_test';
    const first = await identityService.generateExecutorPairingCode(userId, execToken);

    const payloads: { code: string; expiresAt: Date }[] = [];
    const unsub = identityService.subscribePairingRotations(execToken, (p) => {
      payloads.push(p);
    });

    const result = await identityService.invalidateLeakedPairingCodeAndRotate(first.code, {
      platform: 'testplat',
      channel: 'chan-1',
    });

    expect(result.rotated).toBe(true);
    expect(result.newCode).toBeDefined();
    expect(result.newCode).not.toBe(first.code);
    expect(payloads.length).toBe(1);
    expect(payloads[0].code).toBe(result.newCode);

    const doc = await connection.collection('pairing_codes').findOne({ code: first.code });
    expect(doc?.claimed).toBe(true);
    expect(String(doc?.claimedByUserId)).toContain('leaked_group:testplat:chan-1');

    await expect(
      identityService.claimPairingCode('p', 'u', first.code),
    ).rejects.toThrow();

    unsub();
  });

  it('invalidateLeakedPairingCodeAndRotate returns rotated false for unknown code', async () => {
    const r = await identityService.invalidateLeakedPairingCodeAndRotate('XXXXXX', {
      platform: 'p',
      channel: 'c',
    });
    expect(r.rotated).toBe(false);
  });

  it('invalidateLeakedPairingCodeAndRotate returns rotated false for expired code', async () => {
    const PairingModel = getModelForClass(PairingCode, { existingConnection: connection });
    await PairingModel.create({
      code: 'EXPIRED',
      topichubUserId: 'u1',
      executorClaimToken: 'tok1',
      claimed: false,
      expiresAt: new Date(Date.now() - 1000),
    });
    const r = await identityService.invalidateLeakedPairingCodeAndRotate('EXPIRED', {
      platform: 'p',
      channel: 'c',
    });
    expect(r.rotated).toBe(false);
  });

  it('invalidateLeakedPairingCodeAndRotate returns rotated false for already claimed code', async () => {
    const execToken = 'exec_claimed_once';
    const userId = 'usr_claimed_once';
    const { code } = await identityService.generateExecutorPairingCode(userId, execToken);
    await identityService.claimPairingCode('plat', 'uid1', code);

    const r = await identityService.invalidateLeakedPairingCodeAndRotate(code, {
      platform: 'p',
      channel: 'c',
    });
    expect(r.rotated).toBe(false);
  });
});
