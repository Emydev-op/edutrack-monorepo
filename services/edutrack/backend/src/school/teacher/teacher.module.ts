import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { ResultsModule } from '../results/results.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { RegisterService } from './register.service.js';
import { TeacherFrameService } from './teacher-frame.service.js';
import { TeacherScopeService } from './teacher-scope.service.js';
import { TeacherController } from './teacher.controller.js';
import { TeachingService } from './teaching.service.js';

/** Teacher Workspace API (`/v1/me`, `/v1/teaching/...`, `/v1/class-teacher/register...`). */
@Module({
  imports: [AcademicsModule, CurriculumModule, ResultsModule],
  controllers: [TeacherController],
  providers: [
    TeacherScopeService,
    TeachingService,
    RegisterService,
    TeacherFrameService,
    SchoolAuditService,
  ],
  exports: [TeacherFrameService],
})
export class TeacherModule {}
