import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TENANT_HEADER } from '@edutrack/shared';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { refreshCookieName } from './auth/refresh-cookie.service.js';
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

  const swagger = new DocumentBuilder()
    .setTitle('EduTrack API')
    .setDescription(
      'Multi-tenant school management platform API. Errors: `{ statusCode, message, code, ' +
        'error, fields?, requestId }`. Access tokens go in `Authorization: Bearer`; the refresh ' +
        'token is an HttpOnly cookie on /api/v1/auth.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(
      refreshCookieName('SCHOOL_ADMIN'),
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Refresh token cookie, one per portal: et_rt_school_admin, et_rt_teacher, et_rt_platform. ' +
          'HttpOnly, SameSite=Lax, Path=/api/v1/auth.',
      },
      'refresh-cookie',
    )
    .addGlobalParameters({
      in: 'header',
      name: TENANT_HEADER,
      required: false,
      description: 'Development only: school slug or id when the Host has no school subdomain.',
    })
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swagger), {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API on http://localhost:${port}/api — docs on http://localhost:${port}/docs`);
}
await bootstrap();
