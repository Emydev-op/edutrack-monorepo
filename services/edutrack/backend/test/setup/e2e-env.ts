import { applyTestEnv } from './test-env.js';

// Each test worker needs the same environment as the global setup before AppModule loads.
applyTestEnv();
