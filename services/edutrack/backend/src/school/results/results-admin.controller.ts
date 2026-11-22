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
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { pdfFile } from '../../common/pdf/school-documents.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { CorrectionsService } from './corrections.service.js';
import {
  HeadTeacherRemarkDto,
  CorrectionDecisionDto,
  HoldReportCardDto,
  PublishDto,
  ReopenEntryDto,
  SheetDecisionDto,
  TermBodyDto,
} from './dto/results.dto.js';
import { OfficeResultsService } from './office-results.service.js';
import { PublishingService } from './publishing.service.js';

const armId = new RecordIdPipe('Class not found');
const studentId = new RecordIdPipe('Student not found');
const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id of the current session; the current term when omitted.',
});

/**
 * School Admin › Academics › Results: the matrix, sheets (approve, return, reopen entry),
 * publishing per class arm, report cards (and withholding one), and corrections to published
 * scores. Section admins act only on their sections' arms.
 */
@ApiTags('school · results')
@Portals('SCHOOL_ADMIN')
@RequiresModule('results')
@Controller('academics/results')
export class ResultsAdminController {
  constructor(
    private readonly office: OfficeResultsService,
    private readonly publishing: PublishingService,
    private readonly corrections: CorrectionsService,
  ) {}

  @ResponseMessage('Results loaded.')
  @Get()
  @RequirePermission('results.view')
  @termQuery
  @ApiQuery({ name: 'section', required: false, description: 'Section name' })
  @ApiQuery({ name: 'branch', required: false, description: 'Branch name; the first when omitted' })
  @ApiOperation({ summary: 'Every class arm × subject’s sheet status for a section' })
  matrix(@Query() q: { term?: string; section?: string; branch?: string }) {
    return this.office.matrix(q);
  }

  /* ---------------- Sheets ---------------- */

  @ResponseMessage('Sheet loaded.')
  @Get('sheets/:armId/:subject')
  @RequirePermission('results.view')
  @termQuery
  @ApiOperation({ summary: 'One class arm’s sheet for a subject (code), read-only' })
  sheet(
    @Param('armId', armId) arm: string,
    @Param('subject') subject: string,
    @Query('term') term?: string,
  ) {
    return this.office.sheet(arm, subject, term);
  }

  @ResponseMessage('Sheet approved.')
  @Post('sheets/:armId/:subject/approve')
  @HttpCode(200)
  @RequirePermission('results.approve')
  @ApiOperation({ summary: 'Approve a sheet that’s with the academic office' })
  @ApiConflictResponse({ description: 'WITH_HOD · NOT_UNDER_REVIEW · SHEET_LOCKED · TERM_LOCKED' })
  @ApiForbiddenResponse({ description: 'SECTION_FORBIDDEN: another section’s class' })
  approve(
    @CurrentUser() auth: AuthUserContext,
    @Param('armId', armId) arm: string,
    @Param('subject') subject: string,
    @Body() dto: SheetDecisionDto,
  ) {
    return this.office.approve(auth, arm, subject, dto.term);
  }

  @ResponseMessage('Sheet returned to the teacher.')
  @Post('sheets/:armId/:subject/return')
  @HttpCode(200)
  @RequirePermission('results.approve')
  @ApiOperation({ summary: 'Return a sheet to its teacher with a note' })
  returnSheet(
    @CurrentUser() auth: AuthUserContext,
    @Param('armId', armId) arm: string,
    @Param('subject') subject: string,
    @Body() dto: SheetDecisionDto,
  ) {
    return this.office.returnSheet(auth, arm, subject, dto.note, dto.term);
  }

  @ResponseMessage('Result entry reopened for this sheet.')
  @Post('sheets/:armId/:subject/reopen')
  @HttpCode(200)
  @RequirePermission('results.approve')
  @ApiOperation({
    summary: 'Reopen entry on one sheet for N days after the term’s deadline',
    description: 'For a sheet still with its teacher (not started, draft or returned).',
  })
  @ApiConflictResponse({ description: 'ENTRY_OPEN · SHEET_LOCKED · TERM_LOCKED' })
  reopen(
    @CurrentUser() auth: AuthUserContext,
    @Param('armId', armId) arm: string,
    @Param('subject') subject: string,
    @Body() dto: ReopenEntryDto,
  ) {
    return this.office.reopen(auth, arm, subject, dto.days, dto.term);
  }

  /* ---------------- Publishing ---------------- */

  @ResponseMessage('Publish check loaded.')
  @Get('publish/:armId')
  @RequirePermission('results.view')
  @termQuery
  @ApiOperation({ summary: 'What stands between a class arm and publishing' })
  publishCheck(@Param('armId', armId) arm: string, @Query('term') term?: string) {
    return this.publishing.check(arm, term);
  }

  @ResponseMessage((r: { arm: string }) => `${r.arm} results published.`)
  @Post('publish/:armId')
  @HttpCode(200)
  @RequirePermission('results.publish')
  @ApiOperation({
    summary: 'Publish a class arm’s results for the term',
    description:
      'Every subject approved; absent and exempt flags acknowledged. Builds report cards with ' +
      'positions, locks the assessment scheme, and notifies teachers and guardians.',
  })
  @ApiConflictResponse({ description: 'NOT_APPROVED · ALREADY_PUBLISHED · TERM_LOCKED' })
  @ApiUnprocessableEntityResponse({ description: 'FLAGS_UNACKNOWLEDGED' })
  publish(
    @CurrentUser() auth: AuthUserContext,
    @Param('armId', armId) arm: string,
    @Body() dto: PublishDto,
  ) {
    return this.publishing.publish(auth, arm, dto);
  }

  /* ---------------- Report cards ---------------- */

  @ResponseMessage('Report card loaded.')
  @Get('report-card/:studentId')
  @RequirePermission('results.view')
  @termQuery
  @ApiOperation({ summary: 'A student’s report card (a preview until the class is published)' })
  reportCard(@Param('studentId', studentId) id: string, @Query('term') term?: string) {
    return this.publishing.reportCard(id, term);
  }

  @RawResponse()
  @Get('report-card/:studentId/pdf')
  @RequirePermission('results.view')
  @termQuery
  @ApiOperation({
    summary: 'A student’s report card as a PDF (marked as a preview until the class is published)',
  })
  async reportCardPdf(@Param('studentId', studentId) id: string, @Query('term') term?: string) {
    return pdfFile(await this.publishing.reportCardPdf(id, term));
  }

  @ResponseMessage('Head teacher’s comment saved.')
  @Put('report-card/:studentId/head-remark')
  @RequirePermission('results.publish')
  @termQuery
  @ApiOperation({
    summary: 'The head teacher’s comment on a Nursery report card (until published)',
  })
  headRemark(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Body() dto: HeadTeacherRemarkDto,
    @Query('term') term?: string,
  ) {
    return this.publishing.headRemark(auth, id, { term, remark: dto.remark });
  }

  @ResponseMessage('Report card put on hold.')
  @Post('report-card/:studentId/hold')
  @HttpCode(200)
  @RequirePermission('results.publish')
  @ApiOperation({
    summary: 'Withhold a report card with a reason',
    description:
      'Guardians and the student don’t see it, and aren’t notified, until it’s released.',
  })
  hold(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Body() dto: HoldReportCardDto,
  ) {
    return this.publishing.hold(auth, id, dto);
  }

  @ResponseMessage('Report card released.')
  @Post('report-card/:studentId/release')
  @HttpCode(200)
  @RequirePermission('results.publish')
  @ApiOperation({ summary: 'Release a withheld report card' })
  release(@Param('studentId', studentId) id: string, @Body() dto: TermBodyDto) {
    return this.publishing.release(id, dto);
  }

  /* ---------------- Corrections ---------------- */

  @ResponseMessage('Corrections loaded.')
  @Get('corrections')
  @RequirePermission('results.view')
  @ApiOperation({ summary: 'Correction requests on published scores, newest first' })
  correctionList() {
    return this.corrections.adminList();
  }

  @ResponseMessage('Correction applied.')
  @Post('corrections/:id/approve')
  @HttpCode(200)
  @RequirePermission('results.correct')
  @ApiOperation({
    summary: 'Apply a correction',
    description:
      'Changes the score, re-totals, recomputes positions and re-issues the report card.',
  })
  approveCorrection(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CorrectionDecisionDto,
  ) {
    return this.corrections.approve(auth, id, dto.note);
  }

  @ResponseMessage('Correction rejected.')
  @Post('corrections/:id/reject')
  @HttpCode(200)
  @RequirePermission('results.correct')
  @ApiOperation({ summary: 'Reject a correction with a note for the teacher' })
  rejectCorrection(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CorrectionDecisionDto,
  ) {
    return this.corrections.reject(auth, id, dto.note);
  }
}
