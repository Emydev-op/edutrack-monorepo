import { defineConfig } from 'vitest/config';

/**
 * E2E tests run the real AppModule against Postgres (`edutrack_test`) and Redis (database 15).
 * Start the stack first: `npm run infra:up` from the repo root. Files run one at a time because
 * they share the database; each file re-seeds it.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['./test/setup/e2e-env.ts', './test/setup/quiet-logs.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
