import { CommandParser } from '../src/command/command-parser';
import { CommandRouter } from '../src/command/command-router';
import { WebhookHandler } from '../src/webhook/webhook-handler';
import type { OpenClawInboundResult } from '../src/bridge/openclaw-types';

describe('WebhookHandler /id commands', () => {
  function buildInbound(rawCommand: string): OpenClawInboundResult {
    return {
      platform: 'discord',
      channel: 'user:123',
      userId: '123',
      rawCommand,
      originalMessage: rawCommand,
      sessionId: 'sess-1',
      isDm: true,
      imDisplayName: 'bert0324',
    };
  }

  it('prefers paired identity in /id me over self-serve identity link', async () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    const bridge = {
      handleInboundWebhook: jest.fn().mockReturnValue(buildInbound('/id me')),
      sendMessage,
    };
    const identityOps = {
      resolveUserByPlatform: jest.fn().mockResolvedValue({
        topichubUserId: 'identity-superadmin-id',
        claimToken: 'claim_xxx',
      }),
    };
    const imSelfServeOps = {
      getByIdentityId: jest.fn().mockResolvedValue({
        id: 'identity-superadmin-id',
        uniqueId: 'superadmin',
        displayName: 'Super Admin',
        token: 'sa_token_1',
      }),
      getMeForIm: jest.fn().mockResolvedValue({
        id: 'identity-im-id',
        uniqueId: 'im_123',
        displayName: 'im user',
        token: 'id_token_im',
      }),
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const handler = new WebhookHandler(
      new CommandParser(),
      new CommandRouter(),
      {} as any,
      {} as any,
      jest.fn(),
      logger as any,
      () => bridge as any,
      identityOps as any,
      undefined,
      imSelfServeOps as any,
      undefined,
    );

    await handler.handleOpenClaw({});

    expect(identityOps.resolveUserByPlatform).toHaveBeenCalledWith('discord', '123');
    expect(imSelfServeOps.getByIdentityId).toHaveBeenCalledWith('identity-superadmin-id');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0][2] as string;
    expect(message).toContain('superadmin');
    expect(message).toContain('sa_token_1');
    expect(message).not.toContain('id_token_im');
  });
});
