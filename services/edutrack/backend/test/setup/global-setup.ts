import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDemoData } from '../../prisma/seed/demo-data.js';
import { applyTestEnv, TEST_DATABASE } from './test-env.js';

/**
 * Once per e2e run: create `edutrack_test` if needed, apply every migration, seed the demo data
 * and empty the test Redis database.
 */
export default async function globalSetup() {
  const { databaseUrl, redisUrl } = applyTestEnv();

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: adminUrl.toString() }),
  });
  try {
    const name = new URL(databaseUrl).pathname.slice(1) || TEST_DATABASE;
    const exists = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (exists.length === 0)
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    await seedDemoData(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();
}
