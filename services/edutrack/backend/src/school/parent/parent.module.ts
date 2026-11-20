import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { HomeworkModule } from '../homework/homework.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { ParentAccountService } from './parent-account.service.js';
import { ParentController } from './parent.controller.js';
import { ParentFeesService } from './parent-fees.service.js';
import { ParentResultsService } from './parent-results.service.js';
import { ParentSchoolService } from './parent-school.service.js';
import { ParentScopeService } from './parent-scope.service.js';

/**
 * Parent Portal (`/v1/parent/*`): the frame and children, Home, a child's page, fees with
 * transfer claims, report cards, timetable, attendance, announcements, the parent's profile and
 * notification channels. Homework stays in HomeworkModule; notifications in the school inbox
 * (which uses `ParentAccountService`, exported here).
 */
@Module({
  imports: [AuthModule, FinanceModule, HomeworkModule],
  controllers: [ParentController],
  providers: [
    ParentScopeService,
    ParentSchoolService,
    ParentFeesService,
    ParentResultsService,
    ParentAccountService,
    SchoolAuditService,
  ],
  exports: [ParentAccountService],
})
export class ParentModule {}
