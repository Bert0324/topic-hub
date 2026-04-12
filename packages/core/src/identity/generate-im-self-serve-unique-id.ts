import { randomBytes } from 'node:crypto';

const PREFIX = 'im_';

/** Opaque `Identity.uniqueId` for `/id create` (not the IM platform user id). */
export function generateImSelfServeUniqueId(): string {
  return `${PREFIX}${randomBytes(12).toString('hex')}`;
}
