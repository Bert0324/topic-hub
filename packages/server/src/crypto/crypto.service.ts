import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { SecretManager } from './secret-manager';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly secretManager: SecretManager) {
    this.key = this.secretManager.getEncryptionKey();
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
