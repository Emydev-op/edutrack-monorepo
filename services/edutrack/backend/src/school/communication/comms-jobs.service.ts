import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnnouncementsService } from './announcements.service.js';
import { CommsDispatchService } from './comms-dispatch.service.js';

/**
 * Communication's timed work, every minute across schools: scheduled announcements that are due
 * go out, and SMS held for quiet hours is sent once they end. Each school runs in its own tenant
 * context; one school's failure doesn't stop the others.
 */
@Injectable()
export class CommsJobsService {
  private readonly logger = new Logger(CommsJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly announcements: AnnouncementsService,
    private readonly dispatch: CommsDispatchService,
    private readonly clock: Clock,
  ) {}

  async run() {
    const now = this.clock.now();
    const [scheduled, held] = await Promise.all([
      this.prisma.announcement.findMany({
        where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
        select: { schoolId: true },
        distinct: ['schoolId'],
      }),
      this.prisma.messageDelivery.findMany({
        where: { status: 'QUEUED', channel: 'SMS', releaseAt: { lte: now } },
        select: { schoolId: true },
        distinct: ['schoolId'],
      }),
    ]);
    const schools = new Set([...scheduled, ...held].map((r) => r.schoolId));
    let announcements = 0;
    let released = 0;
    for (const schoolId of schools)
      await RequestContext.run({ requestId: 'comms-job', schoolId }, async () => {
        try {
          announcements += await this.announcements.sendDue();
          released += await this.dispatch.releaseHeld();
        } catch (error) {
          this.logger.error({ msg: 'Communication job failed', schoolId, error: String(error) });
        }
      });
    return { announcements, released };
  }
}
