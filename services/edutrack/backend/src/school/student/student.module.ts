import { Module } from '@nestjs/common';
import { HomeworkModule } from '../homework/homework.module.js';
import { ParentModule } from '../parent/parent.module.js';
import { StudentController } from './student.controller.js';
import { StudentPortalService } from './student-portal.service.js';
import { StudentScopeService } from './student-scope.service.js';

/**
 * Student Portal (`/v1/student/*`): the frame, Home, timetable, homework with hand-in, materials,
 * report cards, attendance, announcements and the pupil's profile. Reuses the Parent Portal's read
 * models; notifications are in the school inbox (which uses `StudentScopeService`, exported here).
 */
@Module({
  imports: [ParentModule, HomeworkModule],
  controllers: [StudentController],
  providers: [StudentScopeService, StudentPortalService],
  exports: [StudentScopeService],
})
export class StudentModule {}
