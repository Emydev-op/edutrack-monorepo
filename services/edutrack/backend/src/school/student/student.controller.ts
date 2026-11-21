import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { GuardianSubmissionDto } from '../homework/dto/homework.dto.js';
import { FamilyHomeworkService } from '../homework/family-homework.service.js';
import { ParentResultsService } from '../parent/parent-results.service.js';
import { ParentSchoolService } from '../parent/parent-school.service.js';
import { StudentTermQuery } from './student.dto.js';
import { StudentPortalService } from './student-portal.service.js';
import { StudentScopeService } from './student-scope.service.js';

const assignmentId = new RecordIdPipe('That assignment doesn’t exist.');

/**
 * Student Portal (`<slug>.edutrack.ng/student`) for JSS and SSS pupils with a login. Every route
 * is the signed-in pupil's own: no student ids in the paths. Read-only once they have left.
 * Notifications are in the school inbox; uploads in `POST /v1/uploads`.
 */
@ApiTags('student portal')
@Portals('STUDENT')
@ApiForbiddenResponse({ description: 'NO_ACCESS, STUDENT_LEFT, SUBSCRIPTION_LAPSED' })
@Controller('student')
export class StudentController {
  constructor(
    private readonly scope: StudentScopeService,
    private readonly portal: StudentPortalService,
    private readonly school: ParentSchoolService,
    private readonly reportCards: ParentResultsService,
    private readonly family: FamilyHomeworkService,
  ) {}

  @ResponseMessage('Student Portal loaded.')
  @Get('overview')
  @ApiOperation({ summary: 'The frame: who is signed in, the school’s contact details, the term' })
  async overview(@CurrentUser() auth: AuthUserContext) {
    return this.portal.overview(auth, await this.scope.me(auth));
  }

  @ResponseMessage('Home loaded.')
  @Get('home')
  @ApiOperation({
    summary: 'Home: today’s lessons, homework due, latest result, attendance, announcements',
  })
  async home(@CurrentUser() auth: AuthUserContext) {
    return this.portal.home(auth, await this.scope.me(auth));
  }

  @ResponseMessage('Timetable loaded.')
  @Get('timetable')
  @ApiOperation({ summary: 'The published timetable of my class for a term' })
  async timetable(@CurrentUser() auth: AuthUserContext, @Query() q: StudentTermQuery) {
    return this.school.timetable(await this.scope.me(auth), q.term);
  }

  @ResponseMessage('Homework loaded.')
  @Get('homework')
  @ApiOperation({
    summary: 'My assignments (status; score and feedback once returned) and materials',
  })
  async homework(@CurrentUser() auth: AuthUserContext, @Query() q: StudentTermQuery) {
    return this.portal.homework(await this.scope.me(auth), q.term);
  }

  @ResponseMessage('Materials loaded.')
  @Get('materials')
  @ApiOperation({ summary: 'Materials my teachers shared with my class this term' })
  async materials(@CurrentUser() auth: AuthUserContext, @Query() q: StudentTermQuery) {
    const hw = await this.portal.homework(await this.scope.me(auth), q.term);
    return { termId: hw.termId, materials: hw.materials };
  }

  @ResponseMessage((a: { late: boolean }) =>
    a.late
      ? 'Work handed in late. Your teacher can see it now.'
      : 'Work handed in. Your teacher can see it now.',
  )
  @Post('assignments/:assignmentId/submission')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hand in my work (files from POST /v1/uploads)',
    description:
      'While the assignment is open (after the due date only when late work is accepted, marked ' +
      'Late). Can be replaced until the teacher grades it.',
  })
  @ApiNotFoundResponse({ description: 'Not an assignment set for me' })
  @ApiForbiddenResponse({ description: 'READ_ONLY, GUARDIAN_SUBMITS' })
  @ApiConflictResponse({ description: 'TERM_LOCKED' })
  async submit(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Body() dto: GuardianSubmissionDto,
  ) {
    const me = await this.scope.me(auth);
    StudentScopeService.requireFull(me);
    return this.family.submitAsStudent(auth, me.student.id, id, dto);
  }

  @ResponseMessage('Results loaded.')
  @Get('results')
  @ApiOperation({ summary: 'My report card for a term, once published (held cards say so)' })
  async results(@CurrentUser() auth: AuthUserContext, @Query() q: StudentTermQuery) {
    return this.reportCards.results(await this.scope.me(auth), q.term);
  }

  @ResponseMessage('Attendance loaded.')
  @Get('attendance')
  @ApiOperation({ summary: 'My attendance for a term: summary and every marked day' })
  async attendance(@CurrentUser() auth: AuthUserContext, @Query() q: StudentTermQuery) {
    return this.school.attendance(await this.scope.me(auth), q.term);
  }

  @ResponseMessage('Announcements loaded.')
  @Get('announcements')
  @ApiOperation({
    summary: 'Announcements for students, everyone or my class (not withdrawn or expired)',
  })
  async announcements(@CurrentUser() auth: AuthUserContext) {
    return this.portal.announcements(auth, await this.scope.me(auth));
  }

  @ResponseMessage('Profile loaded.')
  @Get('profile')
  @ApiOperation({ summary: 'My details as the school holds them (read-only)' })
  async profile(@CurrentUser() auth: AuthUserContext) {
    return this.portal.profile(await this.scope.me(auth));
  }
}
