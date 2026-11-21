import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { HomeworkModule } from '../homework/homework.module.js';
import { ResultsModule } from '../results/results.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { AssessmentSchedulesService } from './assessment-schedules.service.js';
import { LessonNotesController } from './lesson-notes.controller.js';
import { LessonNotesService } from './lesson-notes.service.js';
import { TeacherAnnouncementsService } from './teacher-announcements.service.js';

/**
 * The Teacher Workspace's lesson notes (`/v1/lesson-notes`) and their reviews by HODs and the
 * Academic Head (`/v1/reviews/notes`), assessment schedules (`/v1/assessments`) and the staff
 * announcements feed (`/v1/announcements`). Exports the lesson-note counts and to-dos for the
 * Teacher Workspace frame.
 */
@Module({
  imports: [AcademicsModule, CurriculumModule, ResultsModule, HomeworkModule],
  controllers: [LessonNotesController],
  providers: [
    TeacherScopeService,
    LessonNotesService,
    AssessmentSchedulesService,
    TeacherAnnouncementsService,
    SchoolAuditService,
  ],
  exports: [LessonNotesService],
})
export class LessonNotesModule {}
