import { Module } from '@nestjs/common';
import { OrganogramModule } from './organogram/organogram.module.js';
import { PublicSchoolController } from './public/public-school.controller.js';
import { SchoolAuditService } from './shared/school-audit.service.js';
import { SchoolBrandingService } from './shared/school-branding.service.js';
import { SchoolUsersModule } from './users/users.module.js';

/**
 * The school side of the API: what School Admin (admin.edutrack.ng) and the school portals
 * (<slug>.edutrack.ng/teacher, /parent, /student) call. Every route except `public/*` runs with
 * the signed-in school as the tenant, so `TenantPrismaService` only ever sees that school's rows.
 */
@Module({
  imports: [OrganogramModule, SchoolUsersModule],
  controllers: [PublicSchoolController],
  providers: [SchoolBrandingService, SchoolAuditService],
  exports: [SchoolBrandingService, SchoolAuditService],
})
export class SchoolModule {}
