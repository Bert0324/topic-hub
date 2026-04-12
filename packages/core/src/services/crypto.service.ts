import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'crypto';
import type { TopicHubLogger } from '../common/logger';

const DEV_MASTER = 'd'.repeat(64);

export class SecretManager {
  private readonly encryptionKey: Buffer;
  private readonly tokenSecret: string;

  constructor(
    private readonly logger: TopicHubLogger,
    masterKey?: string,
    encryptionKey?: string,
    tokenSecret?: string,
  ) {
    const master = this.resolveMaster(masterKey);

    this.encryptionKey = encryptionKey
      ? Buffer.from(encryptionKey, 'hex')
      : this.derive(master, 'encryption', 32);

    this.tokenSecret =
      tokenSecret ?? this.derive(master, 'token-signing', 32).toString('hex');
  }

  getEncryptionKey(): Buffer {
    return this.encryptionKey;
  }

  getTokenSecret(): string {
    return this.tokenSecret;
  }

  private resolveMaster(masterKey?: string): Buffer {
    if (masterKey) {
      this.logger.log('Master secret loaded from configuration');
      return Buffer.from(masterKey, 'hex');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Master secret must be provided in production');
    }
    this.logger.warn('Using dev master secret (not for production)');
    return Buffer.from(DEV_MASTER, 'hex');
  }

  private derive(master: Buffer, info: string, length: number): Buffer {
    return Buffer.from(
      hkdfSync('sha256', master, Buffer.alloc(0), info, length),
    );
  }
}

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
