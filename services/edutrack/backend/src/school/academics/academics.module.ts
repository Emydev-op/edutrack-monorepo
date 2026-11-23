import { SectionAccessService } from '../shared/section-access.service.js';
import { CalendarService } from './calendar.service.js';
import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { AcademicCatalogService } from './academic-catalog.service.js';
import { AcademicSetupSteps } from './academic-steps.js';
import { AcademicStructureService } from './academic-structure.service.js';
import { AcademicsController } from './academics.controller.js';
import { ClassesService } from './classes.service.js';
import { ClassImportService } from './class-import.service.js';
import { SectionsService } from './sections.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Academics, Phase 1: sections, sessions and terms, class levels and arms (`/v1/academics/...`).
 * Exports its Setup Center steps (`AcademicSetupSteps`) and the structure reader the header's
 * context options use.
 */
@Module({
  controllers: [AcademicsController],
  providers: [
    SectionAccessService,
    CalendarService,
    AcademicStructureService,
    AcademicCatalogService,
    AcademicSetupSteps,
    SectionsService,
    SessionsService,
    ClassesService,
    ClassImportService,
    SchoolAuditService,
    SetupStateService,
  ],
  exports: [
    AcademicStructureService,
    AcademicCatalogService,
    AcademicSetupSteps,
    CalendarService,
    SessionsService,
  ],
})
export class AcademicsModule {}
