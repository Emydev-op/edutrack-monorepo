import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ActivityController } from './activity/activity.controller.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { PlansController } from './plans/plans.controller.js';
import { PlansService } from './plans/plans.service.js';
import { ProvisioningService } from './schools/provisioning.service.js';
import { SchoolsController } from './schools/schools.controller.js';
import { SchoolsService } from './schools/schools.service.js';
import { PlatformAuditService } from './shared/platform-audit.service.js';
import { SubscriptionsController } from './subscriptions/subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions/subscriptions.service.js';

/** The platform back office's API: everything under /api/v1/platform. */
@Module({
  imports: [AuthModule],
  controllers: [
    ActivityController,
    DashboardController,
    PlansController,
    SchoolsController,
    SubscriptionsController,
  ],
  providers: [
    DashboardService,
    PlansService,
    PlatformAuditService,
    ProvisioningService,
    SchoolsService,
    SubscriptionsService,
  ],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
