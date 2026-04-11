import { randomBytes } from 'node:crypto';

export const TOKEN_BYTE_LENGTH = 32;
export const TOKEN_HEX_LENGTH = TOKEN_BYTE_LENGTH * 2;

export const TOKEN_PREFIX_SUPERADMIN = 'sa_';
export const TOKEN_PREFIX_IDENTITY = 'id_';
export const TOKEN_PREFIX_EXECUTOR = 'eth_';

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(TOKEN_BYTE_LENGTH).toString('hex')}`;
}

export function generateSuperadminToken(): string {
  return generateToken(TOKEN_PREFIX_SUPERADMIN);
}

export function generateIdentityToken(): string {
  return generateToken(TOKEN_PREFIX_IDENTITY);
}

export function generateExecutorToken(): string {
  return generateToken(TOKEN_PREFIX_EXECUTOR);
}

export function maskToken(token: string, visibleChars = 8): string {
  if (token.length <= visibleChars) return token;
  return `${token.slice(0, visibleChars)}...${'*'.repeat(4)}`;
}
