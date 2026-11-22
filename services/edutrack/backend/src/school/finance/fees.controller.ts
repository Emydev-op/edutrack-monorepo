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
  DiscountDto,
  FeeItemDto,
  FeesQuery,
  FinanceSettingsDto,
  PlanDto,
  StartFeesDto,
  StructureCopyDto,
  StructurePublishDto,
  StructureSaveDto,
} from './dto/fees.dto.js';
import { FeesService } from './fees.service.js';

/**
 * School Admin › Finance › Fees: fee items, fee structures per term and branch, discounts,
 * payment plans and billing settings. Reading needs `finance.view`, changing `finance.invoice`
 * (whole-school admins only: section admins can look but not change finance).
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('fees')
@Controller('finance')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @ResponseMessage('Fees loaded.')
  @Get('fees')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Fee items, structures per term and branch, notices and suggestions' })
  overview(@Query() q: FeesQuery) {
    return this.fees.overview(q);
  }

  @ResponseMessage(
    (r: { items: number }) => `${r.items} fee item${r.items === 1 ? '' : 's'} added.`,
  )
  @Post('fees/start')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({
    summary: 'Start Finance with the suggested fee items (draft amounts for this term) or Tuition',
  })
  @ApiConflictResponse({ description: 'FEES_STARTED, FEES_PREREQUISITES' })
  start(@Body() dto: StartFeesDto) {
    return this.fees.start(dto.mode);
  }

  @ResponseMessage((i: { name: string }) => `${i.name} added.`)
  @Post('fees/items')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Add a fee item' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  createItem(@Body() dto: FeeItemDto) {
    return this.fees.createItem(dto);
  }

  @ResponseMessage((i: { name: string }) => `${i.name} saved.`)
  @Put('fees/items/:id')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Edit a fee item' })
  @ApiNotFoundResponse({ description: 'FEE_ITEM_NOT_FOUND' })
  updateItem(@Param('id') id: string, @Body() dto: FeeItemDto) {
    return this.fees.updateItem(id, dto);
  }

  @ResponseMessage((r: { archived: boolean }) =>
    r.archived ? 'Fee item archived. Issued invoices keep it.' : 'Fee item removed.',
  )
  @Delete('fees/items/:id')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Remove an unused fee item, or archive one invoices carry' })
  @ApiNotFoundResponse({ description: 'FEE_ITEM_NOT_FOUND' })
  removeItem(@Param('id') id: string) {
    return this.fees.removeItem(id);
  }

  @ResponseMessage((i: { name: string }) => `${i.name} restored.`)
  @Post('fees/items/:id/restore')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Restore an archived fee item' })
  @ApiNotFoundResponse({ description: 'FEE_ITEM_NOT_FOUND' })
  restoreItem(@Param('id') id: string) {
    return this.fees.restoreItem(id);
  }

  @ResponseMessage('Fee structure loaded.')
  @Get('fees/structure')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A term’s fee amounts at a branch, per class level' })
  structure(@Query() q: FeesQuery) {
    return this.fees.structure(q);
  }

  @ResponseMessage((v: { status: string }) =>
    v.status === 'Published' ? 'Amounts saved. New invoices use them.' : 'Draft saved.',
  )
  @Put('fees/structure')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Save a fee structure’s amounts (as a draft until published)' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  saveStructure(@Body() dto: StructureSaveDto) {
    return this.fees.saveStructure(dto);
  }

  @ResponseMessage(
    (v: { term: { name: string }; branch: { name: string } }) =>
      `${v.term.name} fees published at ${v.branch.name}.`,
  )
  @Post('fees/structure/publish')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Publish a fee structure so invoices can be created from it' })
  @ApiUnprocessableEntityResponse({ description: 'STRUCTURE_EMPTY, STRUCTURE_INCOMPLETE' })
  publishStructure(@Body() dto: StructurePublishDto) {
    return this.fees.publishStructure(dto);
  }

  @ResponseMessage('Amounts copied as a draft. Review, then publish.')
  @Post('fees/structure/copy')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Copy another term’s or branch’s amounts as a draft' })
  @ApiConflictResponse({ description: 'STRUCTURE_PUBLISHED' })
  copyStructure(@Body() dto: StructureCopyDto) {
    return this.fees.copyStructure(dto);
  }

  @ResponseMessage('Discounts loaded.')
  @Get('discounts')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Discounts with how often they were given this session' })
  discounts() {
    return this.fees.discounts();
  }

  @ResponseMessage((d: { name: string }) => `${d.name} added.`)
  @Post('discounts')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Add a discount (sibling, staff child, scholarship, custom)' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  createDiscount(@Body() dto: DiscountDto) {
    return this.fees.createDiscount(dto);
  }

  @ResponseMessage((d: { name: string }) => `${d.name} saved.`)
  @Put('discounts/:id')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Edit a discount (applies to invoices created from now on)' })
  @ApiNotFoundResponse({ description: 'DISCOUNT_NOT_FOUND' })
  updateDiscount(@Param('id') id: string, @Body() dto: DiscountDto) {
    return this.fees.updateDiscount(id, dto);
  }

  @ResponseMessage('Payment plans loaded.')
  @Get('plans')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Installment plans with this term’s schedule' })
  plans() {
    return this.fees.plans();
  }

  @ResponseMessage((p: { name: string }) => `${p.name} added.`)
  @Post('plans')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Add an installment plan' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  createPlan(@Body() dto: PlanDto) {
    return this.fees.createPlan(dto);
  }

  @ResponseMessage((p: { name: string }) => `${p.name} saved.`)
  @Put('plans/:id')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Edit an installment plan' })
  @ApiNotFoundResponse({ description: 'PLAN_NOT_FOUND' })
  updatePlan(@Param('id') id: string, @Body() dto: PlanDto) {
    return this.fees.updatePlan(id, dto);
  }

  @ResponseMessage((p: { name: string }) => `${p.name} is now the default plan.`)
  @Post('plans/:id/default')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Make a plan the default for new invoices' })
  @ApiNotFoundResponse({ description: 'PLAN_NOT_FOUND' })
  defaultPlan(@Param('id') id: string) {
    return this.fees.defaultPlan(id);
  }

  @ResponseMessage(
    (p: { name: string; status: string }) =>
      `${p.name} ${p.status === 'Active' ? 'reactivated' : 'deactivated'}.`,
  )
  @Post('plans/:id/toggle')
  @HttpCode(200)
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Deactivate or reactivate a plan (not the default)' })
  @ApiUnprocessableEntityResponse({ description: 'PLAN_IS_DEFAULT' })
  togglePlan(@Param('id') id: string) {
    return this.fees.togglePlan(id);
  }

  @ResponseMessage('Billing settings loaded.')
  @Get('settings')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Billing settings: due dates, payments, late fee, numbering, limits' })
  settings() {
    return this.fees.settings();
  }

  @ResponseMessage('Billing settings saved.')
  @Put('settings')
  @RequirePermission('finance.invoice')
  @ApiOperation({ summary: 'Save billing settings' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  saveSettings(@Body() dto: FinanceSettingsDto) {
    return this.fees.saveSettings(dto);
  }
}
