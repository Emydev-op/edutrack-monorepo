import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import {
  CategoryDto,
  ExpenseDto,
  ExpenseQueryDto,
  PayExpenseDto,
  ReasonDto,
  VendorDto,
  VendorQueryDto,
} from './dto/expenses.dto.js';
import { ExpensesService } from './expenses.service.js';

type Detail = { no: string; status: string; description: string };
type Vendor = { name: string; status: string };

/**
 * Finance › Expenses and Vendors. Reading needs `finance.view`; recording, submitting, paying and
 * vendors `finance.expenses`. Approving and rejecting are checked per step: the Bursar step needs
 * `finance.expenses`, the Principal step (above the expense limit) the Principal or the owner.
 * Section admins can look but not change anything (finance is school-wide).
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('expenses')
@Controller('finance')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @ResponseMessage('Expenses loaded.')
  @Get('expenses')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Expenses with filters, a page of rows and the summary by status' })
  list(@Query() q: ExpenseQueryDto) {
    return this.expenses.list(q);
  }

  @ResponseMessage('Category added.')
  @Post('expenses/categories')
  @HttpCode(200)
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Add an expense category; answers every category' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  addCategory(@Body() dto: CategoryDto) {
    return this.expenses.addCategory(dto.name);
  }

  @ResponseMessage('Expense loaded.')
  @Get('expenses/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'One expense with its approval steps and history' })
  @ApiNotFoundResponse({ description: 'EXPENSE_NOT_FOUND' })
  detail(@Param('id') id: string) {
    return this.expenses.detail(id);
  }

  @ResponseMessage((e: Detail) =>
    e.status === 'Submitted' ? `${e.no} submitted for approval.` : 'Expense saved as a draft.',
  )
  @Post('expenses')
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Record an expense as a draft, or submit it for approval' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  create(@Body() dto: ExpenseDto) {
    return this.expenses.create(dto);
  }

  @ResponseMessage((e: Detail) =>
    e.status === 'Submitted' ? `${e.no} submitted for approval.` : 'Expense saved.',
  )
  @Put('expenses/:id')
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Edit a draft or rejected expense (and submit it)' })
  @ApiConflictResponse({ description: 'EXPENSE_LOCKED' })
  update(@Param('id') id: string, @Body() dto: ExpenseDto) {
    return this.expenses.update(id, dto);
  }

  @ResponseMessage((e: Detail) => `${e.no} submitted for approval.`)
  @Post('expenses/:id/submit')
  @HttpCode(200)
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Submit a draft for approval (numbers it)' })
  @ApiConflictResponse({ description: 'EXPENSE_NOT_DRAFT' })
  submit(@Param('id') id: string) {
    return this.expenses.submit(id);
  }

  @ResponseMessage((e: Detail) =>
    e.status === 'Approved' ? `${e.no} approved.` : `${e.no} approved · waiting for the Principal.`,
  )
  @Post('expenses/:id/approve')
  @HttpCode(200)
  @RequirePermission('finance.view')
  @ApiOperation({
    summary: 'Give the next approval: the Bursar, then the Principal above the expense limit',
  })
  @ApiForbiddenResponse({ description: 'EXPENSE_APPROVER' })
  @ApiConflictResponse({ description: 'EXPENSE_NOT_SUBMITTED' })
  approve(@Param('id') id: string) {
    return this.expenses.approve(id);
  }

  @ResponseMessage((e: Detail) => `${e.no} rejected.`)
  @Post('expenses/:id/reject')
  @HttpCode(200)
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Reject a submitted or approved expense, with the reason' })
  @ApiForbiddenResponse({ description: 'EXPENSE_APPROVER' })
  reject(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.expenses.reject(id, dto.reason);
  }

  @ResponseMessage((e: Detail) => `${e.no} marked as paid.`)
  @Post('expenses/:id/pay')
  @HttpCode(200)
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Record that an approved expense was paid, and from which account' })
  @ApiConflictResponse({ description: 'EXPENSE_NOT_APPROVED' })
  pay(@Param('id') id: string, @Body() dto: PayExpenseDto) {
    return this.expenses.pay(id, dto);
  }

  /* ---------------- Vendors ---------------- */

  @ResponseMessage('Vendors loaded.')
  @Get('vendors')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Vendors with what was paid this session and what is still owed' })
  vendors(@Query() q: VendorQueryDto) {
    return this.expenses.vendors(q);
  }

  @ResponseMessage('Vendor loaded.')
  @Get('vendors/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'One vendor with their expenses and history' })
  @ApiNotFoundResponse({ description: 'VENDOR_NOT_FOUND' })
  vendor(@Param('id') id: string) {
    return this.expenses.vendor(id);
  }

  @ResponseMessage((v: Vendor) => `${v.name} added.`)
  @Post('vendors')
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Add a vendor' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  createVendor(@Body() dto: VendorDto) {
    return this.expenses.createVendor(dto);
  }

  @ResponseMessage((v: Vendor) => `${v.name} updated.`)
  @Put('vendors/:id')
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Edit a vendor' })
  updateVendor(@Param('id') id: string, @Body() dto: VendorDto) {
    return this.expenses.updateVendor(id, dto);
  }

  @ResponseMessage((v: Vendor) =>
    v.status === 'Active' ? `${v.name} reactivated.` : `${v.name} deactivated.`,
  )
  @Post('vendors/:id/toggle')
  @HttpCode(200)
  @RequirePermission('finance.expenses')
  @ApiOperation({ summary: 'Deactivate a vendor (none of their expenses waiting) or reactivate' })
  @ApiUnprocessableEntityResponse({ description: 'VENDOR_HAS_OPEN_EXPENSES' })
  toggleVendor(@Param('id') id: string) {
    return this.expenses.toggleVendor(id);
  }
}
