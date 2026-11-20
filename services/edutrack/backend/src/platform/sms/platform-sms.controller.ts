import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { schoolId } from '../shared/params.js';
import { SenderIdDecisionDto, SenderIdQueueQuery, SmsTopUpDto } from './platform-sms.dto.js';
import { PlatformSmsService } from './platform-sms.service.js';

/**
 * A school's SMS in the back office: units (balance, ledger, top-ups) and sender ID approval.
 * Until EduTrack approves a school's sender ID, its SMS goes out as "EDUTRACK".
 */
@ApiTags('platform · sms')
@Controller('platform')
export class PlatformSmsController {
  constructor(private readonly sms: PlatformSmsService) {}

  @ResponseMessage('Sender ID requests loaded.')
  @Get('sender-ids')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'Sender ID requests across schools (pending by default, oldest first)' })
  queue(@Query() q: SenderIdQueueQuery) {
    return this.sms.queue(q.status);
  }

  @ResponseMessage('SMS loaded.')
  @Get('schools/:id/sms')
  @PlatformOnly('Schools.View')
  @ApiOperation({
    summary: 'A school’s SMS units (balance, this term, ledger) and sender ID requests',
  })
  view(@Param('id', schoolId) id: string) {
    return this.sms.view(id);
  }

  @ResponseMessage('SMS units added.')
  @Post('schools/:id/sms/top-ups')
  @HttpCode(200)
  @PlatformOnly('Subscriptions.Edit')
  @ApiOperation({
    summary: 'Record SMS units the school bought (audited; the school is told in-app)',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  topUp(
    @CurrentUser() auth: AuthUserContext,
    @Param('id', schoolId) id: string,
    @Body() dto: SmsTopUpDto,
  ) {
    return this.sms.topUp(auth, id, dto);
  }

  @ResponseMessage('Sender ID approved. SMS now goes out under it.')
  @Post('schools/:id/sender-id/approve')
  @HttpCode(200)
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Approve the school’s pending sender ID' })
  @ApiConflictResponse({ description: 'NO_PENDING_SENDER_ID' })
  approve(@Param('id', schoolId) id: string, @Body() dto: SenderIdDecisionDto) {
    return this.sms.decide(id, true, dto);
  }

  @ResponseMessage('Sender ID rejected. The school has been told why.')
  @Post('schools/:id/sender-id/reject')
  @HttpCode(200)
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Reject the school’s pending sender ID, with a reason' })
  @ApiConflictResponse({ description: 'NO_PENDING_SENDER_ID' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION: a note is required' })
  reject(@Param('id', schoolId) id: string, @Body() dto: SenderIdDecisionDto) {
    return this.sms.decide(id, false, dto);
  }
}
