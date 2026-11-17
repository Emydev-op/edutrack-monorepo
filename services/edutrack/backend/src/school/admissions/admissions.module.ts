import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { AdmissionRecordsService } from './admission-records.service.js';
import { AdmissionsController, StudentImportsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';
import { StudentImportService } from './student-import.service.js';

/** School Admin › Students › Admissions (`/v1/admissions`) and the student import (`/v1/imports`). */
@Module({
  controllers: [AdmissionsController, StudentImportsController],
  providers: [SchoolAuditService, AdmissionRecordsService, AdmissionsService, StudentImportService],
})
export class AdmissionsModule {}
