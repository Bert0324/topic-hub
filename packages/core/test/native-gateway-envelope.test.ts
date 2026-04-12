import { NativeGatewayEnvelopeSchema } from '../src/gateway/native-gateway.schema';
import { NativeIntegrationGateway } from '../src/gateway/native-integration-gateway';

describe('NativeGatewayEnvelopeSchema', () => {
  it('accepts minimal valid envelope', () => {
    const r = NativeGatewayEnvelopeSchema.safeParse({ v: 1, op: 'health', payload: {} });
    expect(r.success).toBe(true);
  });

  it('rejects missing op', () => {
    const r = NativeGatewayEnvelopeSchema.safeParse({ v: 1, payload: {} });
    expect(r.success).toBe(false);
  });
});

describe('NativeIntegrationGateway', () => {
  it('returns 200 for health', async () => {
    const g = new NativeIntegrationGateway(() => {
      throw new Error('hub should not be needed');
    });
    const r = await g.handle({ v: 1, op: 'health', payload: {} }, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, op: 'health' });
  });

  it('returns 404 for unknown op', async () => {
    const g = new NativeIntegrationGateway(() => {
      throw new Error('hub should not be needed');
    });
    const r = await g.handle({ v: 1, op: 'nope', payload: {} }, {});
    expect(r.status).toBe(404);
    expect(r.body).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'UNKNOWN_OP' }),
      }),
    );
  });
});
