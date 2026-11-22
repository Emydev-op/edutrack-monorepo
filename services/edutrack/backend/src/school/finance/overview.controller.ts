import { RequiresModule } from '../../common/plan/plan-access.js';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { FinanceQueryDto } from './dto/overview.dto.js';
import { FinanceOverviewService } from './overview.service.js';

/**
 * Finance › Overview, its reports and the options every finance screen uses (terms, branches,
 * accounts, methods, categories, vendors, limits). Reading needs `finance.view`.
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('fees')
@Controller('finance')
export class FinanceOverviewController {
  constructor(private readonly overview: FinanceOverviewService) {}

  @ResponseMessage('Options loaded.')
  @Get('options')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Terms, branches, levels, accounts, methods, categories and limits' })
  options() {
    return this.overview.options();
  }

  @ResponseMessage('Finance overview loaded.')
  @Get('overview')
  @RequirePermission('finance.view')
  @ApiOperation({
    summary: 'The term’s billed, collected, outstanding and overdue figures, charts and notices',
  })
  get(@Query() q: FinanceQueryDto) {
    return this.overview.overview(q);
  }

  @ResponseMessage('Report loaded.')
  @Get('reports/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'collection · outstanding · income-expenditure · cash-book' })
  @ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND' })
  report(@Param('id') id: string, @Query() q: FinanceQueryDto) {
    return this.overview.report(id, q);
  }
}
