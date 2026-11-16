import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.validation.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';

/**
 * HTTP setup shared by `main.ts` and the e2e tests, so tests exercise exactly what ships:
 * proxy trust, security headers, CORS with credentials, cookies, `/api` prefix, URI versioning
 * (default v1) and the global validation pipe. The exception filter and guards are providers
 * in AppModule / AuthModule.
 */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<Env, true>);
  const express = app as NestExpressApplication;
  express.set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  express.disable('x-powered-by');
  // Profile photos arrive as data URLs (up to 2 MB, about 2.8 MB of base64).
  express.useBodyParser('json', { limit: '3mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  return app;
}

/** `TRUST_PROXY`: `true`/`false`, a hop count, or Express's names/CIDRs (`loopback, 10.0.0.0/8`). */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
