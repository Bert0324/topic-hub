import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TopicHubModule } from './topichub.provider';
import { TopicHubController } from './api.controller';
import { requestLogger } from './common/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TopicHubModule,
  ],
  controllers: [TopicHubController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestLogger).forRoutes('*');
  }
}
