import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ResultsModule } from '../results/results.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { DashboardService } from './dashboard.service.js';
import { InsightsResultsService } from './insights-results.service.js';
import { InsightsScopeService } from './insights-scope.service.js';
import { SchoolFrameController, SchoolReportsController } from './insights.controller.js';
import { ReportsService } from './reports.service.js';
import { SearchService } from './search.service.js';

/**
 * School Admin's dashboard, command-menu search and Reports (`/v1/dashboard`, `/v1/search`,
 * `/v1/reports`), worked out from the other modules' records. The dashboard and search paths are
 * shared with the Teacher Workspace, whose answers come from `TeacherModule`.
 */
@Module({
  imports: [AcademicsModule, CurriculumModule, FinanceModule, ResultsModule, TeacherModule],
  controllers: [SchoolFrameController, SchoolReportsController],
  providers: [
    InsightsScopeService,
    InsightsResultsService,
    DashboardService,
    SearchService,
    ReportsService,
  ],
})
export class InsightsModule {}
