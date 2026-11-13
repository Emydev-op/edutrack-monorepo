import { Logger } from '@nestjs/common';

// Tests assert on behaviour, not log lines. `TEST_LOGS=1 npm test` shows them.
if (!process.env.TEST_LOGS) Logger.overrideLogger(false);
