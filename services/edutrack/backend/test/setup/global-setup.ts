import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDemoData } from '../../prisma/seed/demo-data.js';
import { applyTestEnv, TEST_DATABASE } from './test-env.js';

/**
 * Once per e2e run: create `edutrack_test` if needed, apply every migration, empty every table,
 * seed the demo data and empty the test Redis database. Emptying first makes a local run start
 * where CI does (a fresh database), so rows earlier runs left behind (audit history, accounts,
 * invitations, imports) can't change what a test sees.
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
    await emptyTestDatabase(prisma, databaseUrl);
    await seedDemoData(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();
}

/** Empties every table of the test database (never any other database), keeping the schema. */
async function emptyTestDatabase(prisma: PrismaClient, databaseUrl: string) {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!/_test$/.test(name))
    throw new Error(`Refusing to empty “${name}”: e2e tests only empty a database named *_test.`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"${t.tablename.replace(/"/g, '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
