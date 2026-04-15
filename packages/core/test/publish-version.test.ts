import { bumpSemverPatch, resolvePublishedSkillVersion } from '../src/services/publish-version';

describe('publish-version', () => {
  it('bumpSemverPatch increments patch', () => {
    expect(bumpSemverPatch('1.2.3')).toBe('1.2.4');
    expect(bumpSemverPatch('0.0.1')).toBe('0.0.2');
  });

  it('bumpSemverPatch falls back for non-semver', () => {
    expect(bumpSemverPatch('v1')).toBe('0.0.1');
    expect(bumpSemverPatch('')).toBe('0.0.1');
  });

  it('resolvePublishedSkillVersion prefers explicit request', () => {
    expect(resolvePublishedSkillVersion('2.0.0', '0.0.1')).toBe('2.0.0');
  });

  it('resolvePublishedSkillVersion bumps when request omitted', () => {
    expect(resolvePublishedSkillVersion(undefined, '1.0.0')).toBe('1.0.1');
    expect(resolvePublishedSkillVersion('', '1.0.0')).toBe('1.0.1');
  });

  it('resolvePublishedSkillVersion starts at 0.0.1 when nothing stored', () => {
    expect(resolvePublishedSkillVersion(undefined, undefined)).toBe('0.0.1');
  });
});
