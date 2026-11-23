import { StudentPhotoService } from './student-photo.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { StudentLoginsController } from '../student-logins/student-logins.controller.js';
import { StudentLoginsModule } from '../student-logins/student-logins.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { MemberPermissions } from './member-permissions.js';
import { StudentAccessService } from './student-access.js';
import { StudentMovesService } from './student-moves.service.js';
import { StudentSetupSteps } from './student-steps.js';
import { EnrollmentController, StudentsController } from './students.controller.js';
import { StudentSubjectsService } from './student-subjects.service.js';
import { StudentsService } from './students.service.js';

/**
 * School Admin › Students (`/v1/students`, `/v1/enrollment/options`, `/v1/enrollments`).
 *
 * Exports for other modules: `StudentsService` (records and rows), `StudentAccessService` with the
 * plain `closeStudentAccess(studentId, tx)` (`student-access.ts`) for the leavers rule, and
 * `StudentSetupSteps` for the Setup Center's Students step.
 */
@Module({
  imports: [AuthModule, StudentLoginsModule],
  // Student logins first: GET /v1/students/logins must register before GET /v1/students/:id.
  controllers: [StudentLoginsController, StudentsController, EnrollmentController],
  providers: [
    SchoolAuditService,
    SetupStateService,
    MemberPermissions,
    StudentAccessService,
    StudentsService,
    StudentMovesService,
    StudentPhotoService,
    StudentSubjectsService,
    StudentSetupSteps,
  ],
  exports: [StudentsService, StudentAccessService, StudentSetupSteps],
})
export class StudentsModule {}
