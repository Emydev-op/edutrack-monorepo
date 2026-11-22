import { ScopedBy } from '../../common/plan/branch-scope.js';
import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import {
  AddLineDto,
  ApplyCreditDto,
  ApplyDiscountDto,
  CancelInvoiceDto,
  ChangePlanDto,
  FinanceStudentsQuery,
  GenerateInvoicesDto,
  InvoiceIdsDto,
  InvoiceListQuery,
  LateFeesDto,
  RemindDto,
  RemoveLineQuery,
} from './dto/invoices.dto.js';
import { InvoicesService } from './invoices.service.js';

const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? word : `${word}s`}`;

/**
 * School Admin › Finance › Invoices and student accounts. Reading needs `finance.view`; creating,
 * issuing and adjusting invoices, reminders and late fees need `finance.invoice` (whole-school
 * admins only: section admins can look but not change finance).
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('fees')
@Controller('finance')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @ResponseMessage('Invoices loaded.')
  @Get('invoices')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Invoices for a term (or all), with totals, counts and notices' })
  list(@Query() q: InvoiceListQuery) {
    return this.invoices.list(q);
  }

  @ResponseMessage('Preview ready.')
  @Post('invoices/generate/preview')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'What generating a term’s invoices would create, per class' })
  preview(@Body() dto: GenerateInvoicesDto) {
    return this.invoices.generatePreview(dto);
  }

  @ResponseMessage((r: { created: number; issued: number }) =>
    r.issued
      ? `${plural(r.issued, 'invoice')} issued.`
      : `${plural(r.created, 'draft invoice')} created.`,
  )
  @Post('invoices/generate')
  @RequirePermission('finance.invoice')
  @ApiOperation({
    summary: 'Generate a term’s invoices from the published fee structures, as drafts or issued',
  })
  @ApiUnprocessableEntityResponse({ description: 'NOTHING_TO_INVOICE' })
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.invoices.generate(dto);
  }

  @ResponseMessage((r: { issued: number }) => `${plural(r.issued, 'invoice')} issued.`)
  @Post('invoices/issue')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Issue draft invoices and send them to the fee payers' })
  issue(@Body() dto: InvoiceIdsDto) {
    return this.invoices.issue(dto);
  }

  @ResponseMessage((r: { recipients: number }, req: { body: RemindDto }) =>
    req.body?.preview
      ? 'Reminder preview ready.'
      : `Reminders sent to ${plural(r.recipients, 'fee payer')}.`,
  )
  @Post('invoices/remind')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({
    summary: 'Remind fee payers of balances (selected invoices, or every overdue one)',
    description: 'With `preview: true`, only counts who would be reminded and the SMS cost.',
  })
  remind(@Body() dto: RemindDto) {
    return this.invoices.remind(dto);
  }

  @ResponseMessage(
    (r: { applied: number }) => `Late fees added to ${plural(r.applied, 'invoice')}.`,
  )
  @Post('invoices/late-fees')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Add the late fee to overdue invoices that don’t have one' })
  @ApiConflictResponse({ description: 'NO_LATE_FEE' })
  lateFees(@Body() dto: LateFeesDto) {
    return this.invoices.lateFees(dto);
  }

  @ResponseMessage('Invoice loaded.')
  @Get('invoices/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'One invoice (by id or number) with lines, payments and history' })
  @ApiNotFoundResponse({ description: 'INVOICE_NOT_FOUND' })
  @ScopedBy('invoice')
  get(@Param('id') id: string) {
    return this.invoices.detail(id);
  }

  @ResponseMessage('Charge added.')
  @Post('invoices/:id/lines')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Add an optional fee item or an ad-hoc charge' })
  @ScopedBy('invoice')
  addLine(@Param('id') id: string, @Body() dto: AddLineDto) {
    return this.invoices.addLine(id, dto);
  }

  @ResponseMessage('Charge removed.')
  @Delete('invoices/:id/lines/:lineId')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Remove a charge (a reason is needed for compulsory ones)' })
  removeLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Query() q: RemoveLineQuery,
  ) {
    return this.invoices.removeLine(id, lineId, q.reason);
  }

  @ResponseMessage('Discount applied.')
  @Post('invoices/:id/discounts')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Apply a discount, scholarship or custom concession' })
  @ScopedBy('invoice')
  applyDiscount(@Param('id') id: string, @Body() dto: ApplyDiscountDto) {
    return this.invoices.applyDiscount(id, dto);
  }

  @ResponseMessage('Discount removed.')
  @Delete('invoices/:id/discounts/:discountLineId')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Remove a discount from the invoice' })
  @ScopedBy('invoice')
  removeDiscount(@Param('id') id: string, @Param('discountLineId') lineId: string) {
    return this.invoices.removeDiscount(id, lineId);
  }

  @ResponseMessage('Payment plan changed.')
  @Put('invoices/:id/plan')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Change the invoice’s (and the student’s) payment plan' })
  @ScopedBy('invoice')
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.invoices.changePlan(id, dto);
  }

  @ResponseMessage('Credit applied.')
  @Post('invoices/:id/apply-credit')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Apply credit on the student’s account to this invoice' })
  @ScopedBy('invoice')
  applyCredit(@Param('id') id: string, @Body() dto: ApplyCreditDto) {
    return this.invoices.applyCredit(id, dto);
  }

  @ResponseMessage('Invoice cancelled.')
  @Post('invoices/:id/cancel')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Cancel an invoice (money paid on it becomes credit)' })
  @ScopedBy('invoice')
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.invoices.cancel(id, dto);
  }

  @ResponseMessage((r: { sentTo: string }) => `Reminder sent to ${r.sentTo}.`)
  @Post('invoices/:id/remind')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Remind the fee payer of this invoice’s balance' })
  @ScopedBy('invoice')
  remindOne(@Param('id') id: string) {
    return this.invoices.remindOne(id);
  }

  /* ---------------- Student accounts ---------------- */

  @ResponseMessage('Students loaded.')
  @Get('students')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Find students to bill or record payments for, with what they owe' })
  students(@Query() q: FinanceStudentsQuery) {
    return this.invoices.students(q);
  }

  @ResponseMessage('Account loaded.')
  @Get('students/:key')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A student’s account: invoices, payments, refunds and statement' })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  @ScopedBy('student', 'key')
  account(@Param('key') key: string) {
    return this.invoices.account(key);
  }

  @ResponseMessage((r: { sentTo: string }) => `Payment details sent to ${r.sentTo}.`)
  @Post('students/:key/send-details')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Send the bank details and transfer reference to the fee payer' })
  @ApiConflictResponse({ description: 'NO_PARENT_ACCOUNT' })
  @ScopedBy('student', 'key')
  sendDetails(@Param('key') key: string) {
    return this.invoices.sendDetails(key);
  }
}
