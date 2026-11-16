import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { NodeEnv, type Env } from '../../config/env.validation.js';
import { DailyChecksService } from './daily-checks.service.js';

export const PLATFORM_JOBS_QUEUE = 'platform-jobs';
const DAILY_CHECKS = 'daily-checks';

/** Runs the back-office morning checks at 07:00 Lagos time, once across all API instances. */
@Processor(PLATFORM_JOBS_QUEUE)
export class DailyChecksProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyChecksProcessor.name);

  constructor(
    @InjectQueue(PLATFORM_JOBS_QUEUE) private readonly queue: Queue,
    private readonly checks: DailyChecksService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    // Tests run the checks directly, against their fixed clock.
    if (this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Test) return;
    await this.queue
      .upsertJobScheduler(
        DAILY_CHECKS,
        { pattern: '0 7 * * *', tz: 'Africa/Lagos' },
        { name: DAILY_CHECKS },
      )
      .catch((error: unknown) =>
        this.logger.error({ msg: 'Daily checks not scheduled', error: String(error) }),
      );
  }

  async process() {
    return this.checks.run();
  }
}
