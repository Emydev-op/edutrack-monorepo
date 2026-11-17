import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { NodeEnv, type Env } from '../../config/env.validation.js';
import { FamilyAccessService } from './family-access.service.js';

export const SCHOOL_JOBS_QUEUE = 'school-jobs';
const FAMILY_ACCESS = 'family-access';

/** Closes ended parent and student access every night at 02:00 Lagos time, once across instances. */
@Processor(SCHOOL_JOBS_QUEUE)
export class FamilyAccessProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(FamilyAccessProcessor.name);

  constructor(
    @InjectQueue(SCHOOL_JOBS_QUEUE) private readonly queue: Queue,
    private readonly access: FamilyAccessService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    // Tests run the job directly, against their fixed clock.
    if (this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Test) return;
    await this.queue
      .upsertJobScheduler(
        FAMILY_ACCESS,
        { pattern: '0 2 * * *', tz: 'Africa/Lagos' },
        { name: FAMILY_ACCESS },
      )
      .catch((error: unknown) =>
        this.logger.error({ msg: 'Family access job not scheduled', error: String(error) }),
      );
  }

  async process() {
    return this.access.closeEndedAccess();
  }
}
