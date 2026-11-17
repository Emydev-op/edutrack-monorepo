import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { OrganogramController } from './organogram.controller.js';
import { OrganogramService } from './organogram.service.js';

/**
 * School › Organogram. Exports `OrganogramService` so the Setup Center can read
 * `organogramStepState()` for its "Organogram & Roles" step.
 */
@Module({
  controllers: [OrganogramController],
  providers: [OrganogramService, SchoolAuditService],
  exports: [OrganogramService],
})
export class OrganogramModule {}
