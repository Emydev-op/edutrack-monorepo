import { Module } from '@nestjs/common';
import { CommsCoreModule } from '../communication/comms-core.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { ClassResultsService } from './class-results.service.js';
import { CorrectionsService } from './corrections.service.js';
import { OfficeResultsService } from './office-results.service.js';
import { PublishingService } from './publishing.service.js';
import { ReportCardsService } from './report-cards.service.js';
import { ResultsAdminController } from './results-admin.controller.js';
import { ResultsCoreService } from './results-core.service.js';
import { ResultsFrameService } from './results-frame.service.js';
import { ResultsTeacherController } from './results-teacher.controller.js';
import { TeacherResultsService } from './teacher-results.service.js';

/**
 * Results, Phase 3b: score sheets with the teacher → HOD → academic office chain, recall,
 * the entry deadline, publishing per class arm with positions and report cards, withheld cards,
 * and corrections to published scores. Teacher Workspace routes (`/v1/results`, `/v1/reviews/
 * sheets`, `/v1/corrections`, `/v1/class-teacher/progress|report-cards`) and School Admin's
 * (`/v1/academics/results/...`). Exports the Teacher Workspace frame's results counts and the
 * academic office's sidebar count.
 */
@Module({
  imports: [AcademicsModule, CurriculumModule, CommsCoreModule],
  controllers: [ResultsTeacherController, ResultsAdminController],
  providers: [
    ResultsCoreService,
    TeacherScopeService,
    TeacherResultsService,
    ClassResultsService,
    OfficeResultsService,
    PublishingService,
    ReportCardsService,
    CorrectionsService,
    ResultsFrameService,
    SectionAccessService,
    SchoolAuditService,
  ],
  exports: [ResultsFrameService, OfficeResultsService, ReportCardsService, ResultsCoreService],
})
export class ResultsModule {}
