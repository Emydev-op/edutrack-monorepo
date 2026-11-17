import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { StudentLoginsController } from './student-logins.controller.js';
import { StudentLoginsService } from './student-logins.service.js';

/** School Admin › Student logins (`/v1/students/logins`). */
@Module({
  imports: [AuthModule],
  controllers: [StudentLoginsController],
  providers: [SchoolAuditService, StudentLoginsService],
})
export class StudentLoginsModule {}
