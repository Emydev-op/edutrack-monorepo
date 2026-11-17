import { Module } from '@nestjs/common';
import { OrganogramModule } from './organogram/organogram.module.js';
import { AcademicsModule } from './academics/academics.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { ContextModule } from './context/context.module.js';
import { PublicSchoolController } from './public/public-school.controller.js';
import { SchoolProfileModule } from './profile/profile.module.js';
import { SchoolAuditService } from './shared/school-audit.service.js';
import { SchoolBrandingService } from './shared/school-branding.service.js';
import { SchoolUsersModule } from './users/users.module.js';
import { StaffModule } from './staff/staff.module.js';
import { SetupModule } from './setup/setup.module.js';

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
    SetupModule,
    ContextModule,
    AdmissionsModule,
    StaffModule,
  ],
  controllers: [PublicSchoolController],
  providers: [SchoolBrandingService, SchoolAuditService],
  exports: [SchoolBrandingService, SchoolAuditService],
})
export class SchoolModule {}
