import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { NodeEnv, type Env } from '../../config/env.validation.js';
import { CommsJobsService } from './comms-jobs.service.js';

export const COMMS_JOBS_QUEUE = 'comms-jobs';
const DUE = 'comms-due';

/** Runs Communication's timed work every minute, once across all API instances. */
@Processor(COMMS_JOBS_QUEUE)
export class CommsJobsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommsJobsProcessor.name);

  constructor(
    @InjectQueue(COMMS_JOBS_QUEUE) private readonly queue: Queue,
    private readonly jobs: CommsJobsService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    // Tests run the job directly, against their fixed clock.
    if (this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Test) return;
    await this.queue
      .upsertJobScheduler(DUE, { every: 60_000 }, { name: DUE })
      .catch((error: unknown) =>
        this.logger.error({ msg: 'Communication job not scheduled', error: String(error) }),
      );
  }

  async process() {
    return this.jobs.run();
  }
}
