import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Local convenience: read .env for `prisma migrate`, `db seed` and friends. Variables already
// set in the environment (CI, the e2e setup, deployed jobs) win over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not connect, so CI and Docker builds work without a database.
    url: process.env.DATABASE_URL ?? '',
  },
});
