import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AcademicSetupSteps } from '../academics/academic-steps.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { PlanningSetupSteps } from '../curriculum/planning-steps.js';
import { StudentsModule } from '../students/students.module.js';
import { StudentSetupSteps } from '../students/student-steps.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { SchoolSetupSteps } from './school-steps.js';
import { SchoolInboxController } from '../inbox/school-inbox.controller.js';
import { SchoolInboxService } from '../inbox/school-inbox.service.js';
import { SetupController } from './setup.controller.js';
import { SETUP_STEP_SOURCES, type SetupStepSource } from './setup-step-source.js';
import { SetupService } from './setup.service.js';

/**
 * The Setup Center (`/v1/setup`). Step sources come from the modules that own the steps; the
 * School-section ones are read straight from their tables here until those modules provide theirs.
 */
@Module({
  imports: [AcademicsModule, CurriculumModule, StudentsModule],
  // The inbox lives here because its sidebar counts read the Setup Center's progress.
  controllers: [SetupController, SchoolInboxController],
  providers: [
    SetupService,
    SchoolInboxService,
    SchoolSetupSteps,
    SchoolAuditService,
    SetupStateService,
    {
      provide: SETUP_STEP_SOURCES,
      inject: [SchoolSetupSteps, AcademicSetupSteps, PlanningSetupSteps, StudentSetupSteps],
      useFactory: (...groups: { all: SetupStepSource[] }[]): SetupStepSource[] =>
        groups.flatMap((g) => g.all),
    },
  ],
  // Settings › School shows the setup progress.
  exports: [SetupService],
})
export class SetupModule {}
