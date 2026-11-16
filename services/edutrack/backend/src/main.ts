import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { buildOpenApi } from './common/http/openapi.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  // JSON lines in production (LOG_JSON), readable output locally.
  const json = process.env.LOG_JSON
    ? process.env.LOG_JSON === 'true'
    : process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new ConsoleLogger({ json, colors: !json }),
  });
  const config = app.get(ConfigService<Env, true>);
  configureApp(app);
  app.enableShutdownHooks();

  const docs =
    config.get('API_DOCS', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (docs)
    SwaggerModule.setup('docs', app, () => buildOpenApi(app), {
      jsonDocumentUrl: 'docs/openapi.json',
      swaggerOptions: { persistAuthorization: true },
    });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API on http://localhost:${port}/api${docs ? ` — docs on http://localhost:${port}/docs` : ''}`,
  );
}
await bootstrap();
