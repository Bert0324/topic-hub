import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './crypto/crypto.module';
import { TenantModule } from './tenant/tenant.module';
import { CoreModule } from './core/core.module';
import { SkillModule } from './skill/skill.module';
import { CommandModule } from './command/command.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { SearchModule } from './search/search.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DatabaseModule,
    CryptoModule,
    TenantModule,
    SkillModule,
    SearchModule,
    CoreModule,
    CommandModule,
    IngestionModule,
    AdminModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
