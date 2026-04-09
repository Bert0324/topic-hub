import { Module } from '@nestjs/common';
import { SecretManager } from './secret-manager';
import { CryptoService } from './crypto.service';

@Module({
  providers: [SecretManager, CryptoService],
  exports: [SecretManager, CryptoService],
})
export class CryptoModule {}
