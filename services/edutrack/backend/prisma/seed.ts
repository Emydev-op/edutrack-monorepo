/**
 * `npm run db:seed` (or `npx prisma db seed`): loads the demo schools and accounts. Idempotent.
 * Refuses to run in production: the demo password and invitation tokens are public.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DEMO_PASSWORD, seedDemoData } from './seed/demo-data.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo accounts with NODE_ENV=production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const summary = await seedDemoData(prisma);
  console.log(
    `Seeded ${Object.keys(summary.schools).join(', ')} and ${summary.users} demo accounts ` +
      `(password ${DEMO_PASSWORD}).`,
  );
} finally {
  await prisma.$disconnect();
}
