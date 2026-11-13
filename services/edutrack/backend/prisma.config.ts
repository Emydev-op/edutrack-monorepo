import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` does not connect, so CI and Docker builds work without a database.
    url: process.env.DATABASE_URL ?? '',
  },
});
