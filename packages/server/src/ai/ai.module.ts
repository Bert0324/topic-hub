import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { AiService, AI_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from './ai.service';
import { ArkProvider } from './providers/ark-provider';
import { AiProvider, AiProviderConfig } from './providers/ai-provider.interface';
import { AiConfig, loadAiConfig } from './ai-config';
import { AiAdminController } from './ai-admin.controller';
import { AiUsageRecord } from './usage/ai-usage.entity';
import { AiUsageService } from './usage/ai-usage.service';
import { TenantSkillConfig } from '../skill/entities/tenant-skill-config.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AiUsageRecord.name,
        schema: getModelForClass(AiUsageRecord).schema,
      },
      {
        name: TenantSkillConfig.name,
        schema: getModelForClass(TenantSkillConfig).schema,
      },
    ]),
  ],
  controllers: [AiAdminController],
  providers: [
    {
      provide: AI_CONFIG_TOKEN,
      useFactory: (): AiConfig => loadAiConfig(),
    },
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: (config: AiConfig): AiProvider | null => {
        if (!config.AI_ENABLED || !config.AI_API_URL || !config.AI_API_KEY) {
          return null;
        }

        const providerConfig: AiProviderConfig = {
          apiUrl: config.AI_API_URL,
          apiKey: config.AI_API_KEY,
          model: config.AI_MODEL,
          timeoutMs: config.AI_TIMEOUT_MS,
        };

        switch (config.AI_PROVIDER) {
          case 'ark':
            return new ArkProvider(providerConfig);
          default:
            return null;
        }
      },
      inject: [AI_CONFIG_TOKEN],
    },
    AiUsageService,
    AiService,
  ],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
