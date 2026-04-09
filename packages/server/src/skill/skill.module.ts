import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { SkillRegistration } from './entities/skill-registration.entity';
import { TenantSkillConfig } from './entities/tenant-skill-config.entity';
import { SkillLoader } from './registry/skill-loader';
import { SkillRegistry } from './registry/skill-registry';
import { SkillConfigService } from './config/skill-config.service';
import { SkillPipeline } from './pipeline/skill-pipeline';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    CryptoModule,
    MongooseModule.forFeature([
      {
        name: SkillRegistration.name,
        schema: getModelForClass(SkillRegistration).schema,
      },
      {
        name: TenantSkillConfig.name,
        schema: getModelForClass(TenantSkillConfig).schema,
      },
    ]),
  ],
  providers: [SkillLoader, SkillRegistry, SkillConfigService, SkillPipeline],
  exports: [SkillRegistry, SkillConfigService, SkillPipeline, SkillLoader],
})
export class SkillModule {}
