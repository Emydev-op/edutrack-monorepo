import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { StudentLoginsService } from './student-logins.service.js';

/**
 * School Admin › Student logins (`/v1/students/logins`). The controller is mounted by
 * `StudentsModule`, ahead of its `GET /v1/students/:id`: Nest registers controllers in the order a
 * module lists them, but registers modules in scan order, which school.module can't control.
 */
@Module({
  imports: [AuthModule],
  providers: [SchoolAuditService, StudentLoginsService],
  exports: [StudentLoginsService],
})
export class StudentLoginsModule {}
