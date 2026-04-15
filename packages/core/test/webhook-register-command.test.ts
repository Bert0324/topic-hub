import { CommandParser } from '../src/command/command-parser';
import { CommandRouter } from '../src/command/command-router';
import { WebhookHandler } from '../src/webhook/webhook-handler';
import type { OpenClawInboundResult } from '../src/bridge/openclaw-types';

describe('WebhookHandler /register parsing', () => {
  function buildInbound(rawCommand: string): OpenClawInboundResult {
    return {
      platform: 'feishu',
      channel: 'user:ou_test_123',
      userId: 'ou_test_123',
      rawCommand,
      originalMessage: rawCommand,
      sessionId: 'agent:main:main',
      isDm: true,
    };
  }

  it('uses only first token after /register', async () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    const bridge = {
      handleInboundWebhook: jest.fn().mockReturnValue(buildInbound('/register Z2SCAP\n2.')),
      sendMessage,
    };
    const identityOps = {
      claimPairingCode: jest.fn().mockResolvedValue({ topichubUserId: 'u1' }),
      resolveUserByPlatform: jest.fn(),
      deactivateBinding: jest.fn(),
      invalidateLeakedPairingCode: jest.fn(),
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
      undefined,
      undefined,
    );

    await handler.handleOpenClaw({});

    expect(identityOps.claimPairingCode).toHaveBeenCalledWith('feishu', 'ou_test_123', 'Z2SCAP');
    expect(sendMessage).toHaveBeenCalledWith(
      'feishu',
      'user:ou_test_123',
      expect.stringContaining('Registered!'),
      expect.any(Object),
    );
  });
});
