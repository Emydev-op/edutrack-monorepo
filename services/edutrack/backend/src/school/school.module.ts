import { Module } from '@nestjs/common';
import { OrganogramModule } from './organogram/organogram.module.js';
import { AcademicsModule } from './academics/academics.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { ContextModule } from './context/context.module.js';
import { CurriculumModule } from './curriculum/curriculum.module.js';
import { PublicSchoolController } from './public/public-school.controller.js';
import { SchoolProfileModule } from './profile/profile.module.js';
import { SchoolAuditService } from './shared/school-audit.service.js';
import { SchoolBrandingService } from './shared/school-branding.service.js';
import { SchoolUsersModule } from './users/users.module.js';
import { StaffModule } from './staff/staff.module.js';
import { GuardiansModule } from './guardians/guardians.module.js';
import { StudentLoginsModule } from './student-logins/student-logins.module.js';
import { SetupModule } from './setup/setup.module.js';
import { SchoolSettingsModule } from './settings/settings.module.js';
import { SchoolSupportModule } from './support/school-support.module.js';
import { TeacherModule } from './teacher/teacher.module.js';
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
    // Results (Phase 3b): /v1/results, /v1/reviews/sheets, /v1/corrections, /v1/class-teacher/
    // progress|report-cards and School Admin's /v1/academics/results/...
    ResultsModule,
    // End-of-session promotion: /v1/academics/promotion.
    PromotionModule,
    // School Admin › Support: /v1/support/tickets (the school’s side of the EduTrack desk).
    SchoolSupportModule,
    // School Admin › Settings: /v1/settings/*.
    SchoolSettingsModule,
    StaffModule,
  ],
  controllers: [PublicSchoolController],
  providers: [SchoolBrandingService, SchoolAuditService],
  exports: [SchoolBrandingService, SchoolAuditService],
})
export class SchoolModule {}
