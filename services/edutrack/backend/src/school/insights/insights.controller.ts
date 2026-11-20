import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { TeacherFrameService } from '../teacher/teacher-frame.service.js';
import { TeachingService } from '../teacher/teaching.service.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardFinanceQueryDto,
  DashboardQueryDto,
  ReportQueryDto,
  SearchQueryDto,
} from './dto/insights.dto.js';
import { ReportsService } from './reports.service.js';
import { SearchService } from './search.service.js';

/**
 * `GET /v1/dashboard` and `GET /v1/search` serve School Admin and the Teacher Workspace on the same
 * paths (one handler per path: two controllers with different portals would clash), each portal
 * getting the shape its screens use.
 */
@ApiTags('school dashboard & search')
@Portals('SCHOOL_ADMIN', 'TEACHER')
@Controller()
export class SchoolFrameController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly searches: SearchService,
    private readonly teacherFrame: TeacherFrameService,
    private readonly teaching: TeachingService,
  ) {}

  @ResponseMessage('Dashboard loaded.')
  @Get('dashboard')
  @ApiOperation({
    summary:
      'School Admin: the working branch at a glance (figures, what needs attention, calendar, enrolment, results by subject, activity). Teacher Workspace: lessons, the next class, today’s register and the to-do list',
    description:
      'Teacher Workspace blocks (metrics, lessons, to-do) are { ok, data } or { ok: false, error }. School Admin fee figures arrive with Finance.',
  })
  dashboard(@CurrentUser() auth: AuthUserContext, @Query() q: DashboardQueryDto) {
    return auth.portal === 'TEACHER'
      ? this.teacherFrame.dashboard(auth, q.term)
      : this.dashboards.summary(q);
  }

  @ResponseMessage('Search results.')
  @Get('search')
  @ApiOperation({
    summary:
      'The command menu. School Admin: students, parents, staff, classes, subjects and support tickets (up to 9). Teacher Workspace: my classes, subjects, students and pages',
  })
  search(@CurrentUser() auth: AuthUserContext, @Query() q: SearchQueryDto) {
    return auth.portal === 'TEACHER'
      ? this.teaching.search(auth, q.q, q.term)
      : this.searches.search(q.q);
  }
}

/** School Admin › Dashboard's fee card and Reports. */
@ApiTags('school reports')
@Portals('SCHOOL_ADMIN')
@Controller()
export class SchoolReportsController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly reports: ReportsService,
  ) {}

  @ResponseMessage('Finance figures loaded.')
  @Get('dashboard/finance')
  @ApiOperation({
    summary: 'The dashboard’s fee receipts and collection by section',
    description:
      'Finance isn’t built yet: answers `available: false` with empty lists, so the dashboard shows that fees arrive with Finance.',
  })
  finance(@Query() _q: DashboardFinanceQueryDto) {
    return this.dashboards.finance();
  }

  @ResponseMessage('Reports loaded.')
  @Get('reports')
  @ApiOperation({
    summary: 'Every report, grouped as the Reports page lists them',
    description:
      'Financial and Communication reports have `available: false` (and `availableWith`) until those modules are built.',
  })
  catalog() {
    return this.reports.catalog();
  }

  @ResponseMessage('Report loaded.')
  @Get('reports/:id')
  @ApiParam({ name: 'id', example: 'enrollment' })
  @ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND' })
  @ApiOperation({
    summary: 'One report for the working branch and its filters',
    description:
      '`blocked` explains why a report can’t be produced yet (no session, or the module it reads isn’t built).',
  })
  report(@Param('id') id: string, @Query() q: ReportQueryDto) {
    return this.reports.report(id, q);
  }
}
