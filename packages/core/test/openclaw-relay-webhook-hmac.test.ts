import * as crypto from 'node:crypto';
import {
  OpenClawBridge,
  embeddedRelayOpenClawWebhookSigningString,
} from '../src/bridge/openclaw-bridge';

describe('embedded relay webhook HMAC', () => {
  const secret = 'test-secret-for-hmac';
  const bridge = OpenClawBridge.forEmbeddedGateway({
    gatewayBaseUrl: 'http://127.0.0.1:9/openclaw',
    webhookSecret: secret,
    platforms: ['feishu'],
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  });

  it('embeddedRelayOpenClawWebhookSigningString matches relay body shape (platform + isDm)', () => {
    const body = {
      event: 'message.received',
      timestamp: '2026-04-15T12:00:00.000Z',
      data: {
        channel: 'user:ou_abc',
        user: 'ou_abc',
        message: '/help',
        sessionId: 'agent:main:feishu:dm:ou_abc',
        platform: 'feishu',
        isDm: true,
      },
    };
    const bodyStr = JSON.stringify(body);
    expect(embeddedRelayOpenClawWebhookSigningString(body)).toBe(bodyStr);
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')}`;

    // Re-order keys in data (platform before sessionId) — common after JSON round-trips
    const reordered = JSON.stringify({
      event: body.event,
      timestamp: body.timestamp,
      data: {
        channel: body.data.channel,
        user: body.data.user,
        message: body.data.message,
        platform: body.data.platform,
        sessionId: body.data.sessionId,
        isDm: body.data.isDm,
      },
    });
    expect(reordered).not.toBe(bodyStr);

    const inbound = bridge.handleInboundWebhook(body, reordered, {
      'x-topichub-signature': sig,
    });
    expect(inbound).not.toBeNull();
    expect(inbound?.rawCommand).toBe('/help');
  });

  it('accepts X-TopicHub-Signature when host only passes JSON.stringify(parsed) (wrong key order)', () => {
    const body = {
      event: 'message.received',
      timestamp: '2026-04-15T12:00:00.000Z',
      data: {
        channel: 'user:x',
        user: 'x',
        message: '/id me',
        sessionId: 'sk',
        platform: 'feishu',
        isDm: true,
        displayName: 'Bert',
      },
    };
    const bodyStr = JSON.stringify(body);
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')}`;

    const wrongOrder = JSON.stringify({
      event: body.event,
      timestamp: body.timestamp,
      data: {
        user: body.data.user,
        channel: body.data.channel,
        message: body.data.message,
        sessionId: body.data.sessionId,
        platform: body.data.platform,
        isDm: body.data.isDm,
        displayName: body.data.displayName,
      },
    });

    const inbound = bridge.handleInboundWebhook(body, wrongOrder, {
      'x-topichub-signature': sig,
    });
    expect(inbound).not.toBeNull();
    expect(inbound?.rawCommand).toBe('/id me');
  });
});
