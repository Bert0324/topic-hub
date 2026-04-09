import { Injectable, Logger } from '@nestjs/common';
import { hkdfSync } from 'crypto';

const DEV_MASTER = 'd'.repeat(64);

@Injectable()
export class SecretManager {
  private readonly logger = new Logger(SecretManager.name);
  private readonly encryptionKey: Buffer;
  private readonly tokenSecret: string;

  constructor() {
    const master = this.resolveMaster();

    this.encryptionKey = process.env.ENCRYPTION_KEY
      ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
      : this.derive(master, 'encryption', 32);

    this.tokenSecret =
      process.env.TOKEN_SECRET ??
      this.derive(master, 'token-signing', 32).toString('hex');
  }

  getEncryptionKey(): Buffer {
    return this.encryptionKey;
  }

  getTokenSecret(): string {
    return this.tokenSecret;
  }

  private resolveMaster(): Buffer {
    const env = process.env.MASTER_SECRET;
    if (env) {
      this.logger.log('Master secret loaded from environment');
      return Buffer.from(env, 'hex');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MASTER_SECRET must be set in production');
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
