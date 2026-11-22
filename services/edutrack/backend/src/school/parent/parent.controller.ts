import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { pdfFile } from '../../common/pdf/school-documents.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { ParentChildDto } from '../guardians/dto/guardians.responses.js';
import {
  FeeClaimDto,
  ParentAnnouncementsQuery,
  ParentPreferencesDto,
  ParentProfileDto,
  ParentTermQuery,
} from './dto/parent.dto.js';
import { ParentAccountService } from './parent-account.service.js';
import { ParentFeesService } from './parent-fees.service.js';
import { ParentResultsService } from './parent-results.service.js';
import { ParentSchoolService } from './parent-school.service.js';
import { ParentScopeService } from './parent-scope.service.js';

const studentId = new RecordIdPipe('That child isn’t linked to your account.');

/**
 * Parent Portal (`<slug>.edutrack.ng/parent`). Every child route is scoped to the signed-in
 * parent's children at this school: `full` access while the child is on the roll, `read-only`
 * for two years after they left (old balances stay payable). Another family's child answers 404.
 * Homework and materials are in `ParentHomeworkController`; notifications in the school inbox.
 */
@ApiTags('parent portal')
@Portals('PARENT')
@ApiForbiddenResponse({ description: 'NO_ACCESS, PARENT_ACCESS_ENDED, SUBSCRIPTION_LAPSED' })
@Controller('parent')
export class ParentController {
  constructor(
    private readonly scope: ParentScopeService,
    private readonly school: ParentSchoolService,
    private readonly fees: ParentFeesService,
    private readonly results: ParentResultsService,
    private readonly account: ParentAccountService,
  ) {}

  @ResponseMessage('Parent Portal loaded.')
  @Get('overview')
  @ApiOperation({
    summary: 'The frame: who is signed in, the school’s contact details, the term, the children',
  })
  overview(@CurrentUser() auth: AuthUserContext) {
    return this.school.overview(auth);
  }

  @ResponseMessage('Children loaded.')
  @Get('children')
  @ApiOperation({
    summary: 'The signed-in parent’s children at this school',
    description:
      'Only children at the school on the address. `access` is `full` for a current student and ' +
      '`read-only` for one who left less than two years ago; older leavers are not listed. ' +
      'Each child carries their class, fee badge and whether the parent pays their fees.',
  })
  @ApiOkResponse({ type: [ParentChildDto] })
  children(@CurrentUser() auth: AuthUserContext) {
    return this.school.childList(auth);
  }

  @ResponseMessage('Child loaded.')
  @Get('children/:studentId')
  @ApiOperation({ summary: 'A child: enrolment, this term at a glance, guardians on record' })
  @ApiNotFoundResponse({ description: 'Not one of your children' })
  async child(@CurrentUser() auth: AuthUserContext, @Param('studentId', studentId) id: string) {
    return this.school.child(auth, await this.scope.child(auth, id));
  }

  @ResponseMessage('Home loaded.')
  @Get('children/:studentId/home')
  @ApiOperation({
    summary: 'Home for a child: fee and absence alerts, latest result, homework, today, news',
  })
  async home(@CurrentUser() auth: AuthUserContext, @Param('studentId', studentId) id: string) {
    return this.school.home(auth, await this.scope.child(auth, id));
  }

  @ResponseMessage('Fees loaded.')
  @RequiresModule('fees')
  @Get('children/:studentId/fees')
  @ApiOperation({
    summary: 'A child’s invoices, installments, earlier balances, payments and where to pay',
    description:
      '`canPay` is false (with the reason) for a guardian who doesn’t pay this child’s fees: ' +
      'they see the fees read-only. Parents pay by bank transfer and then report it with proof.',
  })
  async childFees(@CurrentUser() auth: AuthUserContext, @Param('studentId', studentId) id: string) {
    return this.fees.fees(auth, await this.scope.child(auth, id));
  }

  @ResponseMessage('Thanks. The school will verify your transfer and update the balance.')
  @RequiresModule('fees')
  @Post('children/:studentId/fees/claims')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Report a bank transfer with proof (pending until the school verifies it)',
    description:
      'Creates a parent claim in Finance › Payments (Pending verification). The amount comes ' +
      'from the chosen option. Allowed for a child who has left (old balances).',
  })
  @ApiForbiddenResponse({ description: 'NOT_FEE_PAYER' })
  @ApiConflictResponse({ description: 'NOTHING_TO_PAY, NO_BANK_ACCOUNT' })
  async claim(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Body() dto: FeeClaimDto,
  ) {
    return this.fees.claim(auth, await this.scope.child(auth, id), dto);
  }

  @RawResponse()
  @RequiresModule('fees')
  @Get('children/:studentId/payments/:paymentId/receipt')
  @ApiOperation({ summary: 'A confirmed payment’s receipt for a child, as a PDF' })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'RECEIPT_NOT_READY' })
  async receipt(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Param('paymentId', new RecordIdPipe('Payment not found')) paymentId: string,
  ) {
    return pdfFile(await this.fees.receipt(auth, await this.scope.child(auth, id), paymentId));
  }

  @ResponseMessage('Results loaded.')
  @RequiresModule('results')
  @Get('children/:studentId/results')
  @ApiOperation({
    summary: 'A child’s report card for a term, once published (held cards say so)',
  })
  async childResults(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query() q: ParentTermQuery,
  ) {
    return this.results.results(await this.scope.child(auth, id), q.term);
  }

  @RawResponse()
  @RequiresModule('results')
  @Get('children/:studentId/results/pdf')
  @ApiOperation({ summary: 'A child’s published report card for a term, as a PDF' })
  @ApiConflictResponse({ description: 'RESULT_NOT_PUBLISHED · RESULT_HELD' })
  async childResultsPdf(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query() q: ParentTermQuery,
  ) {
    return pdfFile(await this.results.pdf(await this.scope.child(auth, id), q.term));
  }

  @ResponseMessage('Timetable loaded.')
  @Get('children/:studentId/timetable')
  @ApiOperation({ summary: 'The published timetable of the child’s class for a term' })
  async timetable(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query() q: ParentTermQuery,
  ) {
    return this.school.timetable(await this.scope.child(auth, id), q.term);
  }

  @ResponseMessage('Attendance loaded.')
  @Get('children/:studentId/attendance')
  @ApiOperation({ summary: 'A child’s attendance for a term: summary and every marked day' })
  async attendance(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query() q: ParentTermQuery,
  ) {
    return this.school.attendance(await this.scope.child(auth, id), q.term);
  }

  @ResponseMessage('Announcements loaded.')
  @Get('announcements')
  @ApiOperation({
    summary: 'Announcements for this parent’s families and classes (not withdrawn or expired)',
  })
  async announcements(@CurrentUser() auth: AuthUserContext, @Query() q: ParentAnnouncementsQuery) {
    if (q.child) await this.scope.child(auth, q.child);
    return this.school.announcements(auth, q.child);
  }

  @ResponseMessage('Profile loaded.')
  @Get('profile')
  @ApiOperation({ summary: 'The parent’s contact details' })
  profile(@CurrentUser() auth: AuthUserContext) {
    return this.account.profile(auth);
  }

  @ResponseMessage('Contact details saved. The school can see the change.')
  @Patch('profile')
  @ApiOperation({
    summary: 'Change my phone and address (the sign-in email is changed by the school)',
  })
  updateProfile(@CurrentUser() auth: AuthUserContext, @Body() dto: ParentProfileDto) {
    return this.account.updateProfile(auth, dto);
  }

  @ResponseMessage('Notification settings loaded.')
  @Get('notification-preferences')
  @ApiOperation({ summary: 'In-app, email and SMS on or off, per kind of notification' })
  preferences(@CurrentUser() auth: AuthUserContext) {
    return this.account.preferences(auth);
  }

  @ResponseMessage('Notification settings saved.')
  @Put('notification-preferences')
  @ApiOperation({ summary: 'Save in-app, email and SMS choices per kind of notification' })
  savePreferences(@CurrentUser() auth: AuthUserContext, @Body() dto: ParentPreferencesDto) {
    return this.account.savePreferences(auth, dto);
  }
}
