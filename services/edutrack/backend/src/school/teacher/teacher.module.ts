import { Module } from '@nestjs/common';
import { CommsCoreModule } from '../communication/comms-core.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { HomeworkModule } from '../homework/homework.module.js';
import { LessonNotesModule } from '../lesson-notes/lesson-notes.module.js';
import { ResultsModule } from '../results/results.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { RegisterService } from './register.service.js';
import { TeacherFrameService } from './teacher-frame.service.js';
import { TeacherScopeService } from './teacher-scope.service.js';
import { TeacherController } from './teacher.controller.js';
import { TeachingService } from './teaching.service.js';

/** Teacher Workspace API (`/v1/me`, `/v1/teaching/...`, `/v1/class-teacher/register...`). */
@Module({
  imports: [
    AcademicsModule,
    CurriculumModule,
    ResultsModule,
    CommsCoreModule,
    HomeworkModule,
    LessonNotesModule,
  ],
  controllers: [TeacherController],
  providers: [
    TeacherScopeService,
    TeachingService,
    RegisterService,
    TeacherFrameService,
    SchoolAuditService,
  ],
  exports: [TeacherFrameService, TeachingService],
})
export class TeacherModule {}
