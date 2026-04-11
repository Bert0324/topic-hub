import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TopicHubModule } from './topichub.provider';
import { WebhookController, ApiController, ExecutorController, IdentityController, NoopModelController } from './api.controller';
import { SkillCenterController } from './skill-center.controller';
import { requestLogger } from './common/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TopicHubModule,
  ],
  controllers: [
    WebhookController,
    ApiController,
    SkillCenterController,
    ExecutorController,
    IdentityController,
    NoopModelController,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestLogger).forRoutes('*');
  }
}
