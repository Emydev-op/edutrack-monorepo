import { PlatformModule } from '../../platform/platform.module.js';
import { PlanLimitsService } from '../shared/plan-limits.service.js';
import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { AdmissionRecordsService } from './admission-records.service.js';
import { AdmissionsController, StudentImportsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';
import { ApplicationsService } from './applications.service.js';
import { StudentImportService } from './student-import.service.js';

/** School Admin › Students › Admissions (`/v1/admissions`) and the student import (`/v1/imports`). */
@Module({
  imports: [PlatformModule],
  controllers: [AdmissionsController, StudentImportsController],
  providers: [
    PlanLimitsService,
    SchoolAuditService,
    AdmissionRecordsService,
    AdmissionsService,
    ApplicationsService,
    StudentImportService,
  ],
})
export class AdmissionsModule {}
