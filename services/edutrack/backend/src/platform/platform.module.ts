import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  MeController,
  NotificationsController,
  SearchController,
  SettingsController,
} from './account/account.controller.js';
import { AccountService } from './account/account.service.js';
import { SearchService } from './account/search.service.js';
import { ActivityController, AuditController } from './activity/activity.controller.js';
import { HistoryService } from './activity/history.service.js';
import { DailyChecksProcessor, PLATFORM_JOBS_QUEUE } from './alerts/daily-checks.processor.js';
import { DailyChecksService } from './alerts/daily-checks.service.js';
import { InvitationAlerts } from './alerts/invitation-alerts.js';
import { PlatformAlertsService } from './alerts/platform-alerts.service.js';
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
import { RolesService } from './users/roles.service.js';
import { RolesController, UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

/** The platform back office's API: everything under /api/v1/platform. */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: PLATFORM_JOBS_QUEUE })],
  controllers: [
    ActivityController,
    AuditController,
    DashboardController,
    MeController,
    NotificationsController,
    PlansController,
    RolesController,
    SchoolsController,
    SearchController,
    SettingsController,
    SubscriptionsController,
    UsersController,
  ],
  providers: [
    AccountService,
    DailyChecksProcessor,
    DailyChecksService,
    DashboardService,
    HistoryService,
    InvitationAlerts,
    PlansService,
    PlatformAlertsService,
    PlatformAuditService,
    ProvisioningService,
    RolesService,
    SchoolsService,
    SearchService,
    SubscriptionsService,
    UsersService,
  ],
  exports: [PlatformAuditService, PlatformAlertsService, DailyChecksService],
})
export class PlatformModule {}
