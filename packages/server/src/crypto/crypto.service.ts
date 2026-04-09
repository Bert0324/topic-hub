import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const DEV_KEY = 'a'.repeat(64);

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const envKey = process.env.ENCRYPTION_KEY;

    if (!envKey && process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be set in production');
    }

    this.key = Buffer.from(envKey ?? DEV_KEY, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivB64, encB64] = ciphertext.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', this.key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
