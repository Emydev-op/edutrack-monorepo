import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import {
  CreateIssueDto,
  IssueListQuery,
  IssueMessageDto,
  IssueTransitionDto,
  UpdateIssueDto,
} from './dto/support.dto.js';
import { SupportService } from './support.service.js';

/** Tickets are addressed by their number (`SUP-1182`), as the back office shows them. */
@ApiTags('platform · support')
@Controller('platform/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('summary')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Counts for the tabs and sidebar badge, ratings and charts' })
  summary() {
    return this.support.summary();
  }

  @Get('agents')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Staff who can own tickets, with their team and open tickets' })
  agents() {
    return this.support.agentList();
  }

  @Get('issues')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Tickets in a view (open, unassigned, mine, overdue…), filtered' })
  list(@Query() query: IssueListQuery) {
    return this.support.list(query);
  }

  @Post('issues')
  @PlatformOnly('Support.Create')
  @ApiOperation({ summary: 'Raise a ticket on a school’s behalf' })
  create(@Body() dto: CreateIssueDto) {
    return this.support.create(dto);
  }

  @Get('issues/:number')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'A ticket with its conversation and timeline' })
  get(@Param('number') number: string) {
    return this.support.get(number);
  }

  @Patch('issues/:number')
  @PlatformOnly('Support.Edit')
  @ApiOperation({ summary: 'Assign, reassign (with a reason), change priority or category' })
  @ApiConflictResponse({ description: 'ISSUE_DONE, ISSUE_CHANGED' })
  update(@Param('number') number: string, @Body() dto: UpdateIssueDto) {
    return this.support.update(number, dto);
  }

  @Post('issues/:number/messages')
  @HttpCode(200)
  @PlatformOnly('Support.Edit')
  @ApiOperation({ summary: 'Reply to the school or add an internal note' })
  @ApiConflictResponse({ description: 'ISSUE_CLOSED' })
  message(@Param('number') number: string, @Body() dto: IssueMessageDto) {
    return this.support.message(number, dto);
  }

  @Post('issues/:number/transitions')
  @HttpCode(200)
  @PlatformOnly('Support.Edit')
  @ApiOperation({
    summary: 'Move the ticket on: start, wait, hold, escalate, resolve, close, reopen',
  })
  @ApiConflictResponse({ description: 'ISSUE_TRANSITION, ISSUE_CHANGED' })
  transition(@Param('number') number: string, @Body() dto: IssueTransitionDto) {
    return this.support.transition(number, dto);
  }
}
