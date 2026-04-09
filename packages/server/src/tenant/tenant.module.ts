import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantGuard } from './tenant.guard';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Tenant.name,
        schema: getModelForClass(Tenant).schema,
      },
    ]),
    CryptoModule,
  ],
  providers: [TenantService, TenantGuard],
  exports: [TenantService, TenantGuard],
})
export class TenantModule {}
