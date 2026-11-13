import { existsSync } from 'node:fs';

export const TEST_DATABASE = 'edutrack_test';

/**
 * Environment for the e2e tests: a separate database (`edutrack_test`) and Redis database (15),
 * derived from `.env` / the environment so CI only needs to provide DATABASE_URL and REDIS_URL.
 * Override with TEST_DATABASE_URL / TEST_REDIS_URL.
 */
export function applyTestEnv() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const database = new URL(
    process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://edutrack:edutrack@localhost:5432/edutrack',
  );
  if (!process.env.TEST_DATABASE_URL) database.pathname = `/${TEST_DATABASE}`;
  const redis = new URL(
    process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  if (!process.env.TEST_REDIS_URL) redis.pathname = '/15';

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: database.toString(),
    REDIS_URL: redis.toString(),
    APP_BASE_DOMAIN: 'localhost',
    TRUST_PROXY: 'loopback',
    COOKIE_SECURE: 'false',
    JWT_SECRET: 'e2e-test-secret-that-is-at-least-32-characters-long',
    REFRESH_REUSE_GRACE_SECONDS: '10',
    S3_CREATE_BUCKET: 'false',
  });
  process.env.S3_REGION ??= 'us-east-1';
  process.env.S3_BUCKET ??= 'edutrack-test';
  process.env.S3_ACCESS_KEY_ID ??= 'test';
  process.env.S3_SECRET_ACCESS_KEY ??= 'test';
  return { databaseUrl: database.toString(), redisUrl: redis.toString() };
}
