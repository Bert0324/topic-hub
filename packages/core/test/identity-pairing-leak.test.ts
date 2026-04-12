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

    const payloads: { code: string; expiresAt?: Date }[] = [];
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

  it('invalidateLeakedPairingCodeAndRotate returns rotated false for already invalidated code', async () => {
    const PairingModel = getModelForClass(PairingCode, { existingConnection: connection });
    await PairingModel.create({
      code: 'BURNED',
      topichubUserId: 'u1',
      executorClaimToken: 'tok1',
      claimed: true,
      claimedByUserId: 'leaked_group:p:c',
    });
    const r = await identityService.invalidateLeakedPairingCodeAndRotate('BURNED', {
      platform: 'p',
      channel: 'c',
    });
    expect(r.rotated).toBe(false);
  });

  it('invalidateLeakedPairingCodeAndRotate still rotates after code was used for normal binding', async () => {
    const execToken = 'exec_after_bind';
    const userId = 'usr_after_bind';
    const { code } = await identityService.generateExecutorPairingCode(userId, execToken);
    await identityService.claimPairingCode('plat', 'uid1', code);

    const r = await identityService.invalidateLeakedPairingCodeAndRotate(code, {
      platform: 'p',
      channel: 'c',
    });
    expect(r.rotated).toBe(true);
    expect(r.newCode).toBeDefined();
    expect(r.newCode).not.toBe(code);
  });

  it('same pairing code can bind multiple platform accounts', async () => {
    const { code } = await identityService.generateExecutorPairingCode('u_multi', 'tok_multi');
    await identityService.claimPairingCode('slack', 'a', code);
    await identityService.claimPairingCode('discord', 'b', code);
    const r1 = await identityService.resolveUserByPlatform('slack', 'a');
    const r2 = await identityService.resolveUserByPlatform('discord', 'b');
    expect(r1?.topichubUserId).toBe('u_multi');
    expect(r2?.topichubUserId).toBe('u_multi');
  });

  it('generateExecutorPairingCode returns same code while prior is unclaimed', async () => {
    const a = await identityService.generateExecutorPairingCode('u_reuse', 'tok_reuse');
    const b = await identityService.generateExecutorPairingCode('u_reuse', 'tok_reuse');
    expect(a.code).toBe(b.code);
  });
});
