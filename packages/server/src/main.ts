import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logger';
import { GlobalExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const usePretty = process.env.LOG_FORMAT === 'pretty';

  const app = await NestFactory.create(AppModule, {
    logger: usePretty
      ? ['log', 'error', 'warn', 'debug', 'verbose']
      : new StructuredLogger(),
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'webhooks/(.*)', method: RequestMethod.ALL },
      { path: 'admin/(.*)', method: RequestMethod.ALL },
      { path: 'auth/(.*)', method: RequestMethod.ALL },
    ],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
