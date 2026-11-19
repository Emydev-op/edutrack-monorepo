import { SectionAccessService } from '../shared/section-access.service.js';
import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AssessmentService } from '../assessment/assessment.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { CurriculumService } from './curriculum.service.js';
import { PlanningSetupSteps } from './planning-steps.js';
import { PlanningController } from './planning.controller.js';

/**
 * Academics, Phase 3a: subjects and curriculum, teacher assignments, timetable, assessment and
 * grading, and attendance (`/v1/academics/...`, beside Phase 1's `AcademicsModule`). Exports its
 * services for the Teacher Workspace and its Setup Center steps.
 */
@Module({
  imports: [AcademicsModule],
  controllers: [PlanningController],
  providers: [
    SectionAccessService,
    CurriculumService,
    AssignmentsService,
    TimetableService,
    AssessmentService,
    AttendanceService,
    PlanningSetupSteps,
    SchoolAuditService,
    SetupStateService,
  ],
  exports: [
    CurriculumService,
    AssignmentsService,
    TimetableService,
    AssessmentService,
    AttendanceService,
    PlanningSetupSteps,
  ],
})
export class CurriculumModule {}
