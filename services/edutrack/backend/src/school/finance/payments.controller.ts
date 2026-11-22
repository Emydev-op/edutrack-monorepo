import { ScopedBy } from '../../common/plan/branch-scope.js';
import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { pdfFile } from '../../common/pdf/school-documents.js';
import { money, plural } from './finance-format.js';
import { PaymentsService } from './payments.service.js';
import {
  ApproveRefundDto,
  IdsDto,
  PaymentDto,
  PaymentQuery,
  PayOutDto,
  ReasonDto,
  RefundDto,
  RefundQuery,
} from './dto/payments.dto.js';

type PaymentView = { no: string; amount: number; status: string };
type RefundView = { no: string; amount: number };

/**
 * School Admin › Finance › Payments and refunds. Reading needs `finance.view`; recording,
 * verifying and rejecting payments, requesting and paying out refunds `finance.payment`;
 * approving or rejecting refunds `finance.refund`. Section admins can't change finance.
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('fees')
@Controller('finance')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /* ---------------- Payments ---------------- */

  @ResponseMessage('Payments loaded.')
  @Get('payments')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Payments with filters, paging and the period’s totals' })
  list(@Query() q: PaymentQuery) {
    return this.payments.list(q);
  }

  @ResponseMessage('Payment checked.')
  @Post('payments/check')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({
    summary: 'Validates a payment and shows how it would be allocated, without saving it',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION, DUPLICATE_REFERENCE…' })
  check(@Body() dto: PaymentDto) {
    return this.payments.check(dto);
  }

  @ResponseMessage((p: PaymentView) =>
    p.status === 'Confirmed'
      ? `${money(p.amount)} recorded · receipt ${p.no}.`
      : `${money(p.amount)} recorded as ${p.no}, pending verification.`,
  )
  @Post('payments')
  @RequirePermission('finance.payment')
  @ApiOperation({
    summary: 'Records money the school received (bank transfers wait for verification)',
  })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION, DUPLICATE_REFERENCE, PART_PAYMENT_OFF',
  })
  record(@Body() dto: PaymentDto) {
    return this.payments.record(dto);
  }

  @ResponseMessage(
    (r: { verified: number; total: number }) =>
      `${plural(r.verified, 'payment')} verified · ${money(r.total)}.`,
  )
  @Post('payments/verify-bulk')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Verifies several pending payments' })
  verifyBulk(@Body() dto: IdsDto) {
    return this.payments.verifyBulk(dto.ids);
  }

  @RawResponse()
  @Get('payments/:id/receipt')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A confirmed payment’s receipt, as a PDF' })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'RECEIPT_NOT_READY' })
  @ScopedBy('payment')
  async receipt(@Param('id') id: string) {
    return pdfFile(await this.payments.receipt(id));
  }

  @ResponseMessage('Payment loaded.')
  @Get('payments/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A payment (by id or receipt number) with allocations and history' })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  @ScopedBy('payment')
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }

  @ResponseMessage((p: PaymentView) => `${p.no} verified.`)
  @Post('payments/:id/verify')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Confirms a pending payment after checking the bank statement' })
  @ApiConflictResponse({ description: 'PAYMENT_NOT_PENDING' })
  @ScopedBy('payment')
  verify(@Param('id') id: string) {
    return this.payments.verify(id);
  }

  @ResponseMessage((p: PaymentView) => `${p.no} rejected. The payer has been told.`)
  @Post('payments/:id/reject')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Rejects a pending payment, with the reason sent to the payer' })
  @ApiConflictResponse({ description: 'PAYMENT_NOT_PENDING' })
  @ScopedBy('payment')
  reject(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.payments.reject(id, dto.reason);
  }

  /* ---------------- Refunds ---------------- */

  @ResponseMessage('Refunds loaded.')
  @Get('refunds')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Refunds, newest first, with counts' })
  refunds(@Query() q: RefundQuery) {
    return this.payments.refunds(q);
  }

  @ResponseMessage((r: RefundView) => `Refund ${r.no} of ${money(r.amount)} requested.`)
  @Post('refunds')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Requests a refund out of a student’s credit' })
  @ApiUnprocessableEntityResponse({ description: 'NO_CREDIT, VALIDATION' })
  requestRefund(@Body() dto: RefundDto) {
    return this.payments.requestRefund(dto);
  }

  @ResponseMessage('Refund loaded.')
  @Get('refunds/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A refund with its history' })
  @ApiNotFoundResponse({ description: 'REFUND_NOT_FOUND' })
  getRefund(@Param('id') id: string) {
    return this.payments.getRefund(id);
  }

  @ResponseMessage((r: RefundView) => `${r.no} approved.`)
  @Post('refunds/:id/approve')
  @HttpCode(200)
  @RequirePermission('finance.refund')
  @ApiOperation({
    summary: 'Approves a refund (above the refund limit, records the Proprietor’s approval)',
  })
  approveRefund(@Param('id') id: string, @Body() dto: ApproveRefundDto) {
    return this.payments.approveRefund(id, dto);
  }

  @ResponseMessage((r: RefundView) => `${r.no} rejected. The money stays as credit.`)
  @Post('refunds/:id/reject')
  @HttpCode(200)
  @RequirePermission('finance.refund')
  @ApiOperation({ summary: 'Rejects a refund; the amount stays as credit' })
  rejectRefund(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.payments.rejectRefund(id, dto.reason);
  }

  @ResponseMessage((r: RefundView) => `${r.no} paid out.`)
  @Post('refunds/:id/pay')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Records an approved refund as paid from a school account' })
  payRefund(@Param('id') id: string, @Body() dto: PayOutDto) {
    return this.payments.payRefund(id, dto);
  }
}
