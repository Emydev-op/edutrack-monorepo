import { RequiresModule } from '../../common/plan/plan-access.js';
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { plural } from './finance-format.js';
import { AccountsService } from './accounts.service.js';
import {
  AccountDto,
  ConfirmStatementDto,
  LedgerQuery,
  StatementLineDto,
  StatementUploadDto,
  TransferDto,
} from './dto/accounts.dto.js';

type AccountView = { name: string; status: string };
type StatementView = { lines: number; matched: number; confirmed: number };

/**
 * School Admin › Finance › Bank & cash accounts: balances from what moved through each account,
 * transfers between them, and bank statements matched to recorded payments. Reading needs
 * `finance.view`; every change `finance.payment`. Section admins can't change finance.
 */
@ApiTags('school · finance')
@Portals('SCHOOL_ADMIN')
@RequiresModule('fees')
@Controller('finance')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @ResponseMessage('Accounts loaded.')
  @Get('accounts')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Bank and cash accounts with balances and notices' })
  list() {
    return this.accounts.list();
  }

  @ResponseMessage((a: AccountView) => `${a.name} added.`)
  @Post('accounts')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Adds a bank or cash account' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  create(@Body() dto: AccountDto) {
    return this.accounts.create(dto);
  }

  @ResponseMessage('Transfer recorded.')
  @Post('transfers')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Records money moved between two of the school’s accounts' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION, INSUFFICIENT_FUNDS' })
  transfer(@Body() dto: TransferDto) {
    return this.accounts.transfer(dto);
  }

  @ResponseMessage('Statement loaded.')
  @Get('statements/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'An uploaded statement with each line’s match' })
  @ApiNotFoundResponse({ description: 'STATEMENT_NOT_FOUND' })
  statement(@Param('id') id: string) {
    return this.accounts.getStatement(id);
  }

  @ResponseMessage('Line updated.')
  @Put('statements/:id/lines/:lineId')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Links a line to a pending payment, unlinks it, or ignores it' })
  @ApiNotFoundResponse({ description: 'STATEMENT_NOT_FOUND, LINE_NOT_FOUND' })
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: StatementLineDto,
  ) {
    return this.accounts.updateLine(id, lineId, dto);
  }

  @ResponseMessage((s: StatementView) => `${plural(s.confirmed, 'line')} recorded.`)
  @Post('statements/:id/confirm')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Confirms the pending payments matched on the statement' })
  @ApiUnprocessableEntityResponse({ description: 'NOTHING_MATCHED' })
  confirm(@Param('id') id: string, @Body() dto: ConfirmStatementDto) {
    return this.accounts.confirm(id, dto.lineIds);
  }

  @ResponseMessage('Account loaded.')
  @Get('accounts/:id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'An account with its ledger (paged), statements and last 4 months' })
  @ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
  get(@Param('id') id: string, @Query() q: LedgerQuery) {
    return this.accounts.get(id, q);
  }

  @ResponseMessage((a: AccountView) => `${a.name} saved.`)
  @Put('accounts/:id')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Edits an account' })
  update(@Param('id') id: string, @Body() dto: AccountDto) {
    return this.accounts.update(id, dto);
  }

  @ResponseMessage((a: AccountView) =>
    a.status === 'Active' ? `${a.name} reactivated.` : `${a.name} deactivated.`,
  )
  @Post('accounts/:id/toggle')
  @HttpCode(200)
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Deactivates (balance must be zero) or reactivates an account' })
  toggle(@Param('id') id: string) {
    return this.accounts.toggle(id);
  }

  @ResponseMessage(
    (s: StatementView) => `Statement uploaded · ${plural(s.lines, 'line')}, ${s.matched} matched.`,
  )
  @Post('accounts/:id/statements')
  @RequirePermission('finance.payment')
  @ApiOperation({ summary: 'Uploads a bank statement (CSV text) and matches its lines' })
  @ApiUnprocessableEntityResponse({ description: 'STATEMENT_EMPTY, STATEMENT_COLUMNS' })
  upload(@Param('id') id: string, @Body() dto: StatementUploadDto) {
    return this.accounts.upload(id, dto);
  }

  @ResponseMessage('Sample statement ready.')
  @Get('accounts/:id/sample-statement')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'A sample CSV statement for the account, to try matching' })
  sample(@Param('id') id: string) {
    return this.accounts.sample(id);
  }
}
