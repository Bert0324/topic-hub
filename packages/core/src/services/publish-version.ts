/** Bump `major.minor.patch` by one on the patch segment; fallback when not strict semver. */
export function bumpSemverPatch(v: string): string {
  const trimmed = v.trim();
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  if (!m) return '0.0.1';
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return '0.0.1';
  }
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * When the client omits `version`, assign `0.0.1` for a first publish, otherwise bump the
 * previously stored catalog version (patch +1).
 */
export function resolvePublishedSkillVersion(
  requestedVersion: string | undefined,
  previousStoredVersion: string | undefined,
): string {
  if (requestedVersion !== undefined && requestedVersion !== '') {
    return requestedVersion;
  }
  if (previousStoredVersion !== undefined && previousStoredVersion !== '') {
    return bumpSemverPatch(previousStoredVersion);
  }
  return '0.0.1';
}
