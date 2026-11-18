import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import {
  ConfirmTicketDto,
  NewSchoolTicketDto,
  SchoolTicketQuery,
  SchoolTicketReplyDto,
  TicketReasonDto,
} from './dto/school-support.dto.js';
import { SchoolSupportService } from './school-support.service.js';

/**
 * School Admin › Support: the school's admins and EduTrack support. Teachers, parents and
 * students don't raise tickets. Tickets are addressed by number (SUP-1042).
 */
@ApiTags('school support')
@Portals('SCHOOL_ADMIN')
@Controller('support/tickets')
export class SchoolSupportController {
  constructor(private readonly support: SchoolSupportService) {}

  @Get()
  @ApiOperation({
    summary: 'The school’s tickets by tab, with counts and those waiting on the school',
  })
  list(@Query() q: SchoolTicketQuery) {
    return this.support.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One ticket: the conversation (no internal notes) and its history' })
  @ApiNotFoundResponse({ description: 'Not this school’s ticket' })
  get(@Param('id') id: string) {
    return this.support.get(id);
  }

  @Post()
  @ResponseMessage('Ticket raised. Support will reply here.')
  @ApiOperation({ summary: 'Raise a ticket with EduTrack support (optionally a follow-up)' })
  @ApiConflictResponse({ description: 'Duplicate, or following up a ticket that is still open' })
  @ApiUnprocessableEntityResponse({ description: 'Missing or invalid fields or attachments' })
  create(@CurrentUser() auth: AuthUserContext, @Body() body: NewSchoolTicketDto) {
    return this.support.create(auth, body);
  }

  @Post(':id/replies')
  @HttpCode(200)
  @ResponseMessage('Reply sent.')
  @ApiOperation({ summary: 'Reply; a ticket waiting on the school goes back to support' })
  @ApiConflictResponse({ description: 'Resolved or closed' })
  reply(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() body: SchoolTicketReplyDto,
  ) {
    return this.support.reply(auth, id, body);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ResponseMessage('Thanks. The ticket is closed.')
  @ApiOperation({ summary: 'Confirm a resolved ticket (optional 1–5 rating); it closes' })
  confirm(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() body: ConfirmTicketDto,
  ) {
    return this.support.confirm(auth, id, body.rating);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @ResponseMessage('Ticket reopened. Support will pick it up again.')
  @ApiOperation({ summary: 'Reopen a resolved ticket with what still isn’t working' })
  reopen(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() body: TicketReasonDto,
  ) {
    return this.support.reopen(auth, id, body.reason);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ResponseMessage('Ticket closed.')
  @ApiOperation({ summary: 'Close an open ticket the school no longer needs' })
  close(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() body: TicketReasonDto,
  ) {
    return this.support.close(auth, id, body.reason);
  }
}
