import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/http-exception.filter';

/** Express default is 100kb; webhooks and skill publish can exceed it. */
function jsonBodyLimit(): string {
  const raw = process.env.TOPICHUB_JSON_BODY_LIMIT?.trim();
  return raw && raw.length > 0 ? raw : '15mb';
}

async function bootstrap() {
  const limit = jsonBodyLimit();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useBodyParser('json', { limit });
  app.useBodyParser('urlencoded', { limit, extended: true });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
