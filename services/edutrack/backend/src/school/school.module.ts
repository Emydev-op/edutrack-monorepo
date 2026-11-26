import { BoardingModule } from './boarding/boarding.module.js';
import { GroupModule } from './group/group.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { BranchAccessModule } from './shared/branch-access.service.js';
import { Module } from '@nestjs/common';
import { OrganogramModule } from './organogram/organogram.module.js';
import { AcademicsModule } from './academics/academics.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { CommunicationModule } from './communication/communication.module.js';
import { ContextModule } from './context/context.module.js';
import { CurriculumModule } from './curriculum/curriculum.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { PublicSchoolController } from './public/public-school.controller.js';
import { SchoolProfileModule } from './profile/profile.module.js';
import { SchoolAuditService } from './shared/school-audit.service.js';
import { SchoolBrandingService } from './shared/school-branding.service.js';
import { SchoolUsersModule } from './users/users.module.js';
import { StaffModule } from './staff/staff.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { GuardiansModule } from './guardians/guardians.module.js';
import { StudentLoginsModule } from './student-logins/student-logins.module.js';
import { SetupModule } from './setup/setup.module.js';
import { SchoolSettingsModule } from './settings/settings.module.js';
import { SchoolSupportModule } from './support/school-support.module.js';
import { TeacherModule } from './teacher/teacher.module.js';
import { HomeworkModule } from './homework/homework.module.js';
import { LessonNotesModule } from './lesson-notes/lesson-notes.module.js';
import { ParentModule } from './parent/parent.module.js';
import { StudentModule } from './student/student.module.js';
import { PromotionModule } from './promotion/promotion.module.js';
import { ResultsModule } from './results/results.module.js';
import { StudentsModule } from './students/students.module.js';

/**
 * The school side of the API: what School Admin (admin.edutrack.ng) and the school portals
 * (<slug>.edutrack.ng/teacher, /parent, /student) call. Every route except `public/*` runs with
 * the signed-in school as the tenant, so `TenantPrismaService` only ever sees that school's rows.
 */
@Module({
  // StaffModule last: OrganogramModule's GET /v1/staff/options must register before GET /v1/staff/:id.
  imports: [
    GroupModule,
    BoardingModule,
    MessagingModule,
    BranchAccessModule,
    SchoolProfileModule,
    OrganogramModule,
    SchoolUsersModule,
    AcademicsModule,
    CurriculumModule,
    SetupModule,
    ContextModule,
    // Before any /v1/students/:id route: GET /v1/students/logins.
    StudentLoginsModule,
    GuardiansModule,
    StudentsModule,
    AdmissionsModule,
    // Teacher Workspace: /v1/me, /v1/teaching/..., /v1/class-teacher/register...
    TeacherModule,
    HomeworkModule,
    // Parent Portal: /v1/parent/* (homework under /v1/parent/children/:id/homework is HomeworkModule's).
    ParentModule,
    // Student Portal: /v1/student/*.
    StudentModule,
    // Results (Phase 3b): /v1/results, /v1/reviews/sheets, /v1/corrections, /v1/class-teacher/
    // progress|report-cards and School Admin's /v1/academics/results/...
    ResultsModule,
    // Teacher Workspace: /v1/lesson-notes, /v1/reviews/notes, /v1/assessments, /v1/announcements.
    LessonNotesModule,
    // End-of-session promotion: /v1/academics/promotion.
    PromotionModule,
    // School Admin › Support: /v1/support/tickets (the school’s side of the EduTrack desk).
    SchoolSupportModule,
    // School Admin › Settings: /v1/settings/*.
    SchoolSettingsModule,
    // School Admin › Communication: /v1/comms/* (announcements, delivery logs, templates,
    // notification settings). The inbox (/v1/comms/inbox) is SetupModule's.
    CommunicationModule,
    // School Admin › Finance: /v1/finance/* (fees, invoices, payments, accounts, expenses).
    FinanceModule,
    // School Admin's dashboard, search and Reports; /v1/dashboard and /v1/search also answer the
    // Teacher Workspace.
    InsightsModule,
    StaffModule,
  ],
  controllers: [PublicSchoolController],
  providers: [SchoolBrandingService, SchoolAuditService],
  exports: [SchoolBrandingService, SchoolAuditService],
})
export class SchoolModule {}
