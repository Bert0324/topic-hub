import { openClawTopichubHttpBaseFromWebhookUrl } from '../src/bridge/bridge-config-generator';

describe('openClawTopichubHttpBaseFromWebhookUrl', () => {
  it('returns origin only when webhook has no global prefix', () => {
    expect(openClawTopichubHttpBaseFromWebhookUrl('http://127.0.0.1:3000/webhooks/openclaw')).toBe(
      'http://127.0.0.1:3000',
    );
  });

  it('includes Nest global prefix before webhooks segment', () => {
    expect(
      openClawTopichubHttpBaseFromWebhookUrl('http://127.0.0.1:3000/topic-hub/webhooks/openclaw'),
    ).toBe('http://127.0.0.1:3000/topic-hub');
  });
});
