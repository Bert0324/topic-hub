/**
 * IM principal = (platform, platformUserId) pair stored uniquely on `im_bindings`.
 * Sanity: distinct pairs must not collapse to the same lookup key.
 */
describe('IM platform principal keys', () => {
  const cases = [
    { platform: 'feishu', platformUserId: 'ou_aaa' },
    { platform: 'feishu', platformUserId: 'ou_bbb' },
    { platform: 'discord', platformUserId: 'ou_aaa' },
  ];

  it('uses distinct compound keys for lookup', () => {
    const keys = cases.map((c) => `${c.platform}\0${c.platformUserId}`);
    expect(new Set(keys).size).toBe(cases.length);
  });
});
