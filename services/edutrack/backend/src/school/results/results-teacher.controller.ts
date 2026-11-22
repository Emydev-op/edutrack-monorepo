import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { ClassResultsService } from './class-results.service.js';
import { CorrectionsService } from './corrections.service.js';
import {
  CorrectionRequestDto,
  ReportCardRemarkDto,
  ReviewReturnDto,
  SaveScoresDto,
} from './dto/results.dto.js';
import { TeacherResultsService } from './teacher-results.service.js';

const sheetId = new RecordIdPipe('That sheet wasn’t found.');
const studentId = new RecordIdPipe('Student not found');
const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id; the active term when omitted. Past terms are read-only.',
});

/**
 * Teacher Workspace › Results, Reviews (result sheets) and My class (progress and report-card
 * remarks). Scoped to the signed-in teacher: the sheets they teach (lead or co-teacher), the
 * sheets sent to them as HOD, and their class as class teacher.
 */
@ApiTags('teacher workspace · results')
@Portals('TEACHER')
@RequiresModule('results')
@Controller()
export class ResultsTeacherController {
  constructor(
    private readonly sheets: TeacherResultsService,
    private readonly corrections: CorrectionsService,
    private readonly classResults: ClassResultsService,
  ) {}

  /* ---------------- My sheets ---------------- */

  @ResponseMessage('Results loaded.')
  @Get('results')
  @termQuery
  @ApiQuery({ name: 'class', required: false, description: 'Class arm id' })
  @ApiQuery({ name: 'subject', required: false, description: 'Subject code' })
  @ApiOperation({ summary: 'My score sheets for the term, and my correction requests' })
  list(
    @CurrentUser() auth: AuthUserContext,
    @Query() q: { term?: string; class?: string; subject?: string },
  ) {
    return this.sheets.list(auth, q);
  }

  @ResponseMessage('Sheet loaded.')
  @Get('results/:sheetId')
  @ApiOperation({ summary: 'One of my sheets: scores, totals, flags, the review chain, history' })
  @ApiForbiddenResponse({ description: 'Not a sheet I teach' })
  get(@CurrentUser() auth: AuthUserContext, @Param('sheetId', sheetId) id: string) {
    return this.sheets.get(auth, id);
  }

  @ResponseMessage('Draft saved.')
  @Put('results/:sheetId/scores')
  @ApiOperation({
    summary: 'Save a draft (lead teacher or co-teacher)',
    description:
      'Each score: a number 0–max with at most one decimal place, ABS, EXM or null (missing). ' +
      'Locked once submitted, after the entry deadline (unless reopened) and in past terms.',
  })
  @ApiConflictResponse({ description: 'TERM_LOCKED · SHEET_LOCKED · STALE_SHEET' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with a message per cell' })
  save(
    @CurrentUser() auth: AuthUserContext,
    @Param('sheetId', sheetId) id: string,
    @Body() dto: SaveScoresDto,
  ) {
    return this.sheets.save(auth, id, dto);
  }

  @ResponseMessage('Sheet submitted.')
  @Post('results/:sheetId/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit for review (lead teacher only)',
    description: 'To the subject’s HOD, or straight to the academic office when there is none.',
  })
  @ApiForbiddenResponse({ description: 'NOT_LEAD: co-teachers save but don’t submit' })
  @ApiUnprocessableEntityResponse({ description: 'Scores still missing' })
  submit(@CurrentUser() auth: AuthUserContext, @Param('sheetId', sheetId) id: string) {
    return this.sheets.submit(auth, id);
  }

  @ResponseMessage('Sheet recalled. It’s back in draft.')
  @Post('results/:sheetId/recall')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a submitted sheet back to Draft (lead teacher only)',
    description: 'Only until the HOD forwards or returns it, or the office decides it.',
  })
  @ApiConflictResponse({ description: 'NOT_RECALLABLE · TERM_LOCKED' })
  recall(@CurrentUser() auth: AuthUserContext, @Param('sheetId', sheetId) id: string) {
    return this.sheets.recall(auth, id);
  }

  /* ---------------- Corrections ---------------- */

  @ResponseMessage('Corrections loaded.')
  @Get('corrections')
  @termQuery
  @ApiOperation({ summary: 'My correction requests for the term' })
  correctionList(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.corrections.list(auth, term);
  }

  @ResponseMessage('Correction loaded.')
  @Get('corrections/:id')
  @ApiOperation({ summary: 'One of my correction requests' })
  correction(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.corrections.getMine(auth, id);
  }

  @ResponseMessage('Correction request sent to the academic office.')
  @Post('corrections')
  @ApiOperation({
    summary: 'Ask to change a published score',
    description:
      'On a published sheet I teach: reason of 15+ characters, optional evidence as a data URL ' +
      '(PDF, PNG or JPG up to 10 MB). One open request per student and component.',
  })
  @ApiConflictResponse({ description: 'SHEET_LOCKED (not published) · DUPLICATE' })
  requestCorrection(@CurrentUser() auth: AuthUserContext, @Body() dto: CorrectionRequestDto) {
    return this.corrections.request(auth, dto);
  }

  /* ---------------- Reviews (HODs) ---------------- */

  @ResponseMessage('Reviews loaded.')
  @Get('reviews/sheets')
  @termQuery
  @ApiOperation({ summary: 'Sheets waiting on me (HOD), and the ones I decided this term' })
  @ApiForbiddenResponse({ description: 'Not a head of department' })
  reviews(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.sheets.reviewList(auth, term);
  }

  @ResponseMessage('Sheet loaded.')
  @Get('reviews/sheets/:sheetId')
  @ApiOperation({ summary: 'A sheet sent to me, read-only, with whether I can act on it' })
  reviewSheet(@CurrentUser() auth: AuthUserContext, @Param('sheetId', sheetId) id: string) {
    return this.sheets.reviewSheet(auth, id);
  }

  @ResponseMessage('Sheet forwarded to the academic office.')
  @Post('reviews/sheets/:sheetId/forward')
  @HttpCode(200)
  @ApiOperation({ summary: 'Forward a submitted sheet to the academic office' })
  @ApiConflictResponse({ description: 'SHEET_LOCKED: no longer waiting on me · TERM_LOCKED' })
  forward(@CurrentUser() auth: AuthUserContext, @Param('sheetId', sheetId) id: string) {
    return this.sheets.forward(auth, id);
  }

  @ResponseMessage('Sheet returned to the teacher.')
  @Post('reviews/sheets/:sheetId/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Return a submitted sheet to its teacher with a comment' })
  returnSheet(
    @CurrentUser() auth: AuthUserContext,
    @Param('sheetId', sheetId) id: string,
    @Body() dto: ReviewReturnDto,
  ) {
    return this.sheets.returnSheet(auth, id, dto.comment);
  }

  /* ---------------- My class ---------------- */

  @ResponseMessage('Class progress loaded.')
  @Get('class-teacher/progress')
  @termQuery
  @ApiOperation({ summary: 'Every subject’s sheet for my class' })
  @ApiForbiddenResponse({ description: 'Not a class teacher this term' })
  progress(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.classResults.progress(auth, term);
  }

  @ResponseMessage((r: { teacherName: string }) => `Reminder sent to ${r.teacherName}.`)
  @Post('class-teacher/progress/:sheetId/remind')
  @HttpCode(200)
  @termQuery
  @ApiOperation({ summary: 'Remind a subject teacher in-app (once a day per sheet)' })
  @ApiConflictResponse({ description: 'OWN_SHEET · NOT_REMINDABLE · ALREADY_REMINDED' })
  remind(
    @CurrentUser() auth: AuthUserContext,
    @Param('sheetId', sheetId) id: string,
    @Query('term') term?: string,
  ) {
    return this.classResults.remind(auth, id, term);
  }

  @ResponseMessage('Report cards loaded.')
  @Get('class-teacher/report-cards')
  @termQuery
  @ApiOperation({ summary: 'Remarks progress, totals so far and attendance for my class' })
  reportCards(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.classResults.reportCards(auth, term);
  }

  @ResponseMessage('Report card loaded.')
  @Get('class-teacher/report-cards/:studentId')
  @termQuery
  @ApiOperation({ summary: 'One student’s remark and conduct ratings' })
  reportCard(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query('term') term?: string,
  ) {
    return this.classResults.reportCard(auth, id, term);
  }

  @ResponseMessage('Remark and ratings saved.')
  @Put('class-teacher/report-cards/:studentId')
  @termQuery
  @ApiOperation({
    summary: 'Save a student’s remark (20–400 characters) and five ratings (1–5)',
    description: 'Read-only once the class’s results are published, and in past terms.',
  })
  saveReportCard(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Body() dto: ReportCardRemarkDto,
    @Query('term') term?: string,
  ) {
    return this.classResults.saveReportCard(auth, id, dto, term);
  }
}
