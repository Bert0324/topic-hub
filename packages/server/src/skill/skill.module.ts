import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { SkillRegistration } from './entities/skill-registration.entity';
import { TenantSkillConfig } from './entities/tenant-skill-config.entity';
import { Topic } from '../core/entities/topic.entity';
import { TimelineEntry } from '../core/entities/timeline-entry.entity';
import { SkillLoader } from './registry/skill-loader';
import { SkillRegistry } from './registry/skill-registry';
import { SkillMdParser } from './registry/skill-md-parser';
import { SkillConfigService } from './config/skill-config.service';
import { SkillPipeline } from './pipeline/skill-pipeline';
import { SkillAiRuntime } from './pipeline/skill-ai-runtime';
import { CryptoModule } from '../crypto/crypto.module';
import { AiModule } from '../ai/ai.module';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [
    CryptoModule,
    AiModule,
    DispatchModule,
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
  providers: [
    SkillLoader,
    SkillMdParser,
    SkillRegistry,
    SkillConfigService,
    SkillPipeline,
    SkillAiRuntime,
  ],
  exports: [SkillRegistry, SkillConfigService, SkillPipeline, SkillLoader],
})
export class SkillModule {}
