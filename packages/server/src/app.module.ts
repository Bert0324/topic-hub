import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CryptoModule,
    TenantModule,
    AiModule,
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
