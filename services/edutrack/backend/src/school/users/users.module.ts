import { PlatformModule } from '../../platform/platform.module.js';
import { PlanLimitsService } from '../shared/plan-limits.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SchoolRolesController } from './roles.controller.js';
import { SchoolRolesService } from './roles.service.js';
import { SchoolUsersController, StaffOptionsController } from './users.controller.js';
import { SchoolUsersService } from './users.service.js';

/** Settings › Users & Roles, and the staff picker (`/v1/staff/options`). */
@Module({
  imports: [PlatformModule, AuthModule],
  controllers: [SchoolUsersController, SchoolRolesController, StaffOptionsController],
  providers: [PlanLimitsService, SchoolUsersService, SchoolRolesService, SchoolAuditService],
  exports: [SchoolUsersService, SchoolRolesService],
})
export class SchoolUsersModule {}
