import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { SkillModule } from '../skill/skill.module';
import { TenantModule } from '../tenant/tenant.module';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';

@Module({
  imports: [CoreModule, SkillModule, TenantModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
