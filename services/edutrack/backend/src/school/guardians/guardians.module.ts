import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { FamilyAccessProcessor, SCHOOL_JOBS_QUEUE } from './family-access.processor.js';
import { FamilyAccessService } from './family-access.service.js';
import { GuardianAccountsService } from './guardian-accounts.service.js';
import { GuardiansController } from './guardians.controller.js';
import { GuardiansService } from './guardians.service.js';
import { ParentController } from './parent.controller.js';

/**
 * Parents / Guardians (`/v1/guardians`), their Parent Portal accounts, the parent's children list
 * (`/v1/parent/children`) and the nightly job that closes ended parent and student access.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: SCHOOL_JOBS_QUEUE })],
  controllers: [GuardiansController, ParentController],
  providers: [
    SchoolAuditService,
    GuardiansService,
    GuardianAccountsService,
    FamilyAccessService,
    FamilyAccessProcessor,
  ],
  exports: [FamilyAccessService],
})
export class GuardiansModule {}
