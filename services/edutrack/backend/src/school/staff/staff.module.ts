import { PlatformModule } from '../../platform/platform.module.js';
import { PlanLimitsService } from '../shared/plan-limits.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { StaffAccountsService } from './staff-accounts.service.js';
import { StaffDocumentsService } from './staff-documents.service.js';
import { StaffImportService } from './staff-import.service.js';
import { StaffReadGuard } from './staff-read.guard.js';
import { StaffRecordsService } from './staff-records.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

/**
 * School Admin › Staff (`/v1/staff`). Exports `StaffService` for the Setup Center, which reads
 * `staffStepState()` for its "Staff" step.
 */
@Module({
  imports: [PlatformModule, AuthModule],
  controllers: [StaffController],
  providers: [
    PlanLimitsService,
    SchoolAuditService,
    StaffRecordsService,
    StaffAccountsService,
    StaffDocumentsService,
    StaffImportService,
    StaffReadGuard,
    StaffService,
  ],
  exports: [StaffService],
})
export class StaffModule {}
