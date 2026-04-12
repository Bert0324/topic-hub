/** Strip leading/trailing slashes; empty → no prefix. */
export function normalizeHttpPrefix(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/^\/+|\/+$/g, '');
  return t.length > 0 ? t : undefined;
}
