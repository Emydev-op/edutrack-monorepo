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
import { type MessageRequest, ResponseMessage } from '../../common/http/api-response.js';

/** Tickets are addressed by their number (`SUP-1182`), as the back office shows them. */
type Issue = {
  id: string;
  assignee: string | null;
  priority: string;
  category: string;
  team: string;
};

/** Assigning, reassigning, or changing priority or category. */
const issueUpdated = (
  i: Issue,
  req: MessageRequest<{
    assignee?: string | null;
    priority?: string;
    category?: string;
    reason?: string;
  }>,
) => {
  if (req.body.assignee !== undefined)
    return i.assignee
      ? `${req.body.reason ? 'Reassigned' : 'Assigned'} to ${i.assignee}.`
      : 'Ticket unassigned.';
  if (req.body.priority) return `Priority set to ${i.priority}.`;
  if (req.body.category) return `Category set to ${i.category}.`;
  return `${i.id} updated.`;
};

/** Each status step, as the person who took it would describe it. */
const issueMoved = (i: Issue, req: MessageRequest<{ to: string }>) => {
  switch (req.body.to) {
    case 'In Progress':
      return 'Work started.';
    case 'Waiting for School':
      return 'Question sent. SLA paused.';
    case 'On Hold':
      return 'On hold. SLA paused.';
    case 'Escalated':
      return i.assignee
        ? `Escalated to ${i.team}. ${i.assignee} has it now.`
        : `Escalated to ${i.team}. It’s waiting in the team’s queue.`;
    case 'Resolved':
      return 'Resolved. The school has been asked to confirm.';
    case 'Reopened':
      return `${i.id} reopened.`;
    default:
      return `${i.id} closed.`;
  }
};

@ApiTags('platform · support')
@Controller('platform/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @ResponseMessage('Support summary loaded.')
  @Get('summary')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Counts for the tabs and sidebar badge, ratings and charts' })
  summary() {
    return this.support.summary();
  }

  @ResponseMessage('Agents loaded.')
  @Get('agents')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Staff who can own tickets, with their team and open tickets' })
  agents() {
    return this.support.agentList();
  }

  @ResponseMessage('Tickets loaded.')
  @Get('issues')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'Tickets in a view (open, unassigned, mine, overdue…), filtered' })
  list(@Query() query: IssueListQuery) {
    return this.support.list(query);
  }

  @ResponseMessage((i: { id: string }) => `${i.id} created.`)
  @Post('issues')
  @PlatformOnly('Support.Create')
  @ApiOperation({ summary: 'Raise a ticket on a school’s behalf' })
  create(@Body() dto: CreateIssueDto) {
    return this.support.create(dto);
  }

  @ResponseMessage('Ticket loaded.')
  @Get('issues/:number')
  @PlatformOnly('Support.View')
  @ApiOperation({ summary: 'A ticket with its conversation and timeline' })
  get(@Param('number') number: string) {
    return this.support.get(number);
  }

  @ResponseMessage(issueUpdated)
  @Patch('issues/:number')
  @PlatformOnly('Support.Edit')
  @ApiOperation({ summary: 'Assign, reassign (with a reason), change priority or category' })
  @ApiConflictResponse({ description: 'ISSUE_DONE, ISSUE_CHANGED' })
  update(@Param('number') number: string, @Body() dto: UpdateIssueDto) {
    return this.support.update(number, dto);
  }

  @ResponseMessage((_r: unknown, req: MessageRequest<{ kind: string }>) =>
    req.body.kind === 'note' ? 'Internal note added.' : 'Reply sent to the school.',
  )
  @Post('issues/:number/messages')
  @HttpCode(200)
  @PlatformOnly('Support.Edit')
  @ApiOperation({ summary: 'Reply to the school or add an internal note' })
  @ApiConflictResponse({ description: 'ISSUE_CLOSED' })
  message(@Param('number') number: string, @Body() dto: IssueMessageDto) {
    return this.support.message(number, dto);
  }

  @ResponseMessage(issueMoved)
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
