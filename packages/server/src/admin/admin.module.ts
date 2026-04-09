import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { SkillModule } from '../skill/skill.module';
import { TenantModule } from '../tenant/tenant.module';
import { CoreModule } from '../core/core.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { SkillRegistration } from '../skill/entities/skill-registration.entity';
import { TenantSkillConfig } from '../skill/entities/tenant-skill-config.entity';
import { Topic } from '../core/entities/topic.entity';
import { TimelineEntry } from '../core/entities/timeline-entry.entity';

@Module({
  imports: [
    SkillModule,
    TenantModule,
    CoreModule,
    MongooseModule.forFeature([
      {
        name: SkillRegistration.name,
        schema: getModelForClass(SkillRegistration).schema,
      },
      {
        name: TenantSkillConfig.name,
        schema: getModelForClass(TenantSkillConfig).schema,
      },
      {
        name: Topic.name,
        schema: getModelForClass(Topic).schema,
      },
      {
        name: TimelineEntry.name,
        schema: getModelForClass(TimelineEntry).schema,
      },
    ]),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
