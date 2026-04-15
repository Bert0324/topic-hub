import type { Model } from 'mongoose';

/**
 * ByteDoc / bytedmongoose compatibility shim for document creation & save.
 *
 * bytedmongoose (forked from Mongoose 5.x) does NOT define
 * `Document.prototype.ownerDocument` on top-level documents — only on
 * Subdocument / EmbeddedDocument.  Mongoose 8 expects it on every document
 * (it calls `this.ownerDocument()` during `$set` / validation).
 *
 * These helpers patch the single missing method on document instances when
 * needed.  This preserves schema validation, defaults, and timestamps —
 * unlike raw `collection.insertOne()`.
 *
 * Works transparently with both standard Mongoose 8 and bytedmongoose.
 */

/**
 * Create and persist a new document, safe for bytedmongoose connections.
 */
export async function safeCreate<T>(
  model: Model<T>,
  data: Record<string, unknown>,
): Promise<InstanceType<Model<T>>> {
  const doc = new model(data) as any;
  patchOwnerDocument(doc);
  return doc.save();
}

/**
 * Save an existing (possibly modified) document, safe for bytedmongoose.
 */
export async function safeSave<D extends { save(): Promise<any> }>(doc: D): Promise<D> {
  patchOwnerDocument(doc);
  await doc.save();
  return doc;
}

/**
 * Ensure `ownerDocument()` exists on a document instance.
 * Safe to call multiple times — no-ops when already present.
 */
export function patchOwnerDocument(doc: unknown): void {
  const d = doc as Record<string, unknown>;
  if (typeof d.ownerDocument !== 'function') {
    d.ownerDocument = function (this: unknown) {
      return this;
    };
  }
}
