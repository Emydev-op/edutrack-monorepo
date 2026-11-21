import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { CommsCoreModule } from '../communication/comms-core.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { AssignmentsHomeworkService } from './assignments-homework.service.js';
import { FamilyHomeworkService } from './family-homework.service.js';
import { HomeworkCoreService } from './homework-core.service.js';
import { HomeworkController, UploadsController } from './homework.controller.js';
import { HomeworkFilesService } from './homework-files.js';
import { MaterialsHomeworkService } from './materials-homework.service.js';
import { ParentHomeworkController } from './parent-homework.controller.js';

/**
 * Homework: the Teacher Workspace's assignments, submissions and materials (`/v1/assignments`,
 * `/v1/materials`), uploads (`/v1/uploads`) and the Parent Portal's view of a child's homework
 * (`/v1/parent/children/:id/homework`, handing in for primary pupils). Exports the parts the
 * Teacher Workspace frame and lesson page show (to grade, open assignment, latest material).
 */
@Module({
  imports: [AcademicsModule, CommsCoreModule, AuthModule],
  controllers: [UploadsController, HomeworkController, ParentHomeworkController],
  providers: [
    TeacherScopeService,
    HomeworkCoreService,
    HomeworkFilesService,
    AssignmentsHomeworkService,
    MaterialsHomeworkService,
    FamilyHomeworkService,
    SchoolAuditService,
  ],
  exports: [
    AssignmentsHomeworkService,
    MaterialsHomeworkService,
    FamilyHomeworkService,
    HomeworkFilesService,
  ],
})
export class HomeworkModule {}
