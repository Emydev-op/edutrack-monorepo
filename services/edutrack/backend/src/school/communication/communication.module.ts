import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { MemberPermissions } from '../students/member-permissions.js';
import { AnnouncementsService } from './announcements.service.js';
import { CommsAudienceService } from './comms-audience.service.js';
import { CommsCoreModule } from './comms-core.module.js';
import { COMMS_JOBS_QUEUE, CommsJobsProcessor } from './comms-jobs.processor.js';
import { CommsJobsService } from './comms-jobs.service.js';
import { CommsSettingsService } from './comms-settings.service.js';
import { CommunicationController } from './communication.controller.js';
import { DeliveriesService } from './deliveries.service.js';

/** School Admin › Communication (`/v1/comms/*`) and its every-minute job. */
@Module({
  imports: [CommsCoreModule, BullModule.registerQueue({ name: COMMS_JOBS_QUEUE })],
  controllers: [CommunicationController],
  providers: [
    AnnouncementsService,
    CommsAudienceService,
    CommsSettingsService,
    DeliveriesService,
    CommsJobsService,
    CommsJobsProcessor,
    SectionAccessService,
    SchoolAuditService,
    MemberPermissions,
  ],
  exports: [AnnouncementsService],
})
export class CommunicationModule {}
