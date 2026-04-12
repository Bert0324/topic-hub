import { NATIVE_INTEGRATION_SEGMENT } from '../src/gateway/constants';

describe('native gateway path contract', () => {
  it('uses stable segment for CLI + server', () => {
    expect(NATIVE_INTEGRATION_SEGMENT).toBe('topic-hub');
  });
});
