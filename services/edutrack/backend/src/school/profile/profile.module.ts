import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SchoolBrandingService } from '../shared/school-branding.service.js';
import { BranchesController } from './branches.controller.js';
import { BranchesService } from './branches.service.js';
import { SchoolProfileController } from './profile.controller.js';
import { SchoolProfileService } from './profile.service.js';

/**
 * Settings › School profile and Branches (`/v1/school/profile`, `/v1/branches`). Exports
 * `BranchesService` for the Setup Center (`branchesStepState()`).
 */
@Module({
  controllers: [SchoolProfileController, BranchesController],
  providers: [SchoolProfileService, BranchesService, SchoolAuditService, SchoolBrandingService],
  exports: [BranchesService],
})
export class SchoolProfileModule {}
