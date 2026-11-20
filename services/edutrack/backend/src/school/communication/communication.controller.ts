import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { AnnouncementsService } from './announcements.service.js';
import { CommsSettingsService } from './comms-settings.service.js';
import { DeliveriesService } from './deliveries.service.js';
import {
  AnnouncementDto,
  AnnouncementQuery,
  AudiencePreviewDto,
  DeliveryDetailQuery,
  DeliveryQuery,
  QuietHoursDto,
  SenderIdDto,
  TemplateDto,
  WithdrawDto,
} from './dto/comms.dto.js';

const announcementId = new RecordIdPipe('Announcement not found');
const messageId = new RecordIdPipe('Message not found');

type Saved = { status: string; recipients: number | null };

/**
 * School Admin › Communication: announcements, delivery logs, message templates and the
 * notification settings (Settings → Notifications). Reading needs `comms.view`; writing an
 * announcement `comms.class` (classes) or `comms.school` (any other audience); templates,
 * settings and retries `comms.school`. Section admins send only to their sections' classes.
 */
@ApiTags('school · communication')
@Portals('SCHOOL_ADMIN')
@Controller('comms')
export class CommunicationController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly deliveries: DeliveriesService,
    private readonly settings: CommsSettingsService,
  ) {}

  @ResponseMessage('Options loaded.')
  @Get('options')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'Branches, classes with students on roll, and the event list' })
  options() {
    return this.announcements.options();
  }

  /* ---------------- Announcements ---------------- */

  @ResponseMessage('Announcements loaded.')
  @Get('announcements')
  @RequirePermission('comms.view')
  @ApiOperation({
    summary: 'Announcements by status, newest first, with counts and the SMS units left',
  })
  list(@Query() q: AnnouncementQuery) {
    return this.announcements.list(q);
  }

  @ResponseMessage('Recipients counted.')
  @Post('announcements/preview')
  @HttpCode(200)
  @RequirePermission('comms.view')
  @ApiOperation({
    summary: 'Who an audience reaches on each channel, the SMS units it needs and has',
    description:
      '`enough` is false when the school has fewer SMS units than the send needs: it can still ' +
      'go, but SMS beyond the units left is marked "Not sent · out of SMS units" (in-app and ' +
      'email still go). `smsSendable` says how many SMS would go out.',
  })
  preview(@Body() dto: AudiencePreviewDto) {
    return this.announcements.preview(dto);
  }

  @ResponseMessage((a: Saved) =>
    a.status === 'Sent'
      ? `Sent to ${(a.recipients ?? 0).toLocaleString('en-NG')} recipients.`
      : a.status === 'Scheduled'
        ? 'Announcement scheduled.'
        : 'Saved as a draft.',
  )
  @Post('announcements')
  @RequirePermission('comms.class')
  @ApiOperation({ summary: 'Save a draft, schedule, or send an announcement now' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  @ApiForbiddenResponse({
    description: 'SECTION_FORBIDDEN, or a school-wide audience without comms.school',
  })
  create(@CurrentUser() auth: AuthUserContext, @Body() dto: AnnouncementDto) {
    return this.announcements.create(auth, dto);
  }

  @ResponseMessage('Announcement loaded.')
  @Get('announcements/:id')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'One announcement with its delivery counts and history' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  get(@Param('id', announcementId) id: string) {
    return this.announcements.get(id);
  }

  @ResponseMessage((a: Saved) =>
    a.status === 'Sent'
      ? `Sent to ${(a.recipients ?? 0).toLocaleString('en-NG')} recipients.`
      : a.status === 'Scheduled'
        ? 'Announcement scheduled.'
        : 'Draft saved.',
  )
  @Put('announcements/:id')
  @RequirePermission('comms.class')
  @ApiOperation({
    summary: 'Edit a draft or scheduled announcement (and save, schedule or send it)',
  })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_EDITABLE' })
  update(
    @CurrentUser() auth: AuthUserContext,
    @Param('id', announcementId) id: string,
    @Body() dto: AnnouncementDto,
  ) {
    return this.announcements.update(auth, id, dto);
  }

  @ResponseMessage('Draft deleted.')
  @Delete('announcements/:id')
  @RequirePermission('comms.class')
  @ApiOperation({ summary: 'Delete a draft' })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_DRAFT' })
  remove(@Param('id', announcementId) id: string) {
    return this.announcements.remove(id);
  }

  @ResponseMessage('Schedule cancelled. It’s a draft again.')
  @Post('announcements/:id/cancel')
  @HttpCode(200)
  @RequirePermission('comms.class')
  @ApiOperation({ summary: 'Cancel a scheduled announcement (back to draft)' })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_SCHEDULED' })
  cancel(@Param('id', announcementId) id: string) {
    return this.announcements.cancel(id);
  }

  @ResponseMessage('Withdrawn from the portals.')
  @Post('announcements/:id/withdraw')
  @HttpCode(200)
  @RequirePermission('comms.class')
  @ApiOperation({
    summary: 'Take a sent announcement out of the portals',
    description: 'Email and SMS already sent can’t be recalled.',
  })
  @ApiConflictResponse({
    description: 'ANNOUNCEMENT_NOT_WITHDRAWABLE, ANNOUNCEMENT_NOT_RECALLABLE',
  })
  withdraw(@Param('id', announcementId) id: string, @Body() dto: WithdrawDto) {
    return this.announcements.withdraw(id, dto.reason);
  }

  @ResponseMessage('Copied as a new draft.')
  @Post('announcements/:id/duplicate')
  @HttpCode(200)
  @RequirePermission('comms.class')
  @ApiOperation({ summary: 'Copy an announcement into a new draft' })
  duplicate(@CurrentUser() auth: AuthUserContext, @Param('id', announcementId) id: string) {
    return this.announcements.duplicate(auth, id);
  }

  /* ---------------- Delivery logs ---------------- */

  @ResponseMessage('Delivery logs loaded.')
  @Get('deliveries')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'Messages sent, one row per message and channel, with a summary' })
  deliveryList(@Query() q: DeliveryQuery) {
    return this.deliveries.list(q);
  }

  @ResponseMessage((r: { retried: number }) =>
    r.retried === 1
      ? '1 message sent again.'
      : `${r.retried.toLocaleString('en-NG')} messages sent again.`,
  )
  @Post('deliveries/retry-failed')
  @HttpCode(200)
  @RequirePermission('comms.school')
  @ApiOperation({ summary: 'Send every retryable failed email and SMS again (uses SMS units)' })
  @ApiConflictResponse({ description: 'NOTHING_TO_RETRY' })
  retryFailed() {
    return this.deliveries.retryFailed();
  }

  @ResponseMessage('Message loaded.')
  @Get('deliveries/:id')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'One message: content, counts and each recipient’s outcome' })
  deliveryDetail(@Param('id', messageId) id: string, @Query() q: DeliveryDetailQuery) {
    return this.deliveries.detail(id, q);
  }

  @ResponseMessage((r: { retried: number }) =>
    r.retried === 1
      ? '1 message sent again.'
      : `${r.retried.toLocaleString('en-NG')} messages sent again.`,
  )
  @Post('deliveries/:id/retry')
  @HttpCode(200)
  @RequirePermission('comms.school')
  @ApiOperation({ summary: 'Send a message’s retryable failed email and SMS again' })
  @ApiConflictResponse({ description: 'NOTHING_TO_RETRY' })
  retry(@Param('id', messageId) id: string) {
    return this.deliveries.retry(id);
  }

  /* ---------------- Templates & events ---------------- */

  @ResponseMessage('Templates loaded.')
  @Get('templates')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'The automatic messages’ templates' })
  templates() {
    return this.settings.templates();
  }

  @ResponseMessage('Template loaded.')
  @Get('templates/:event')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'One event’s wording per channel, its defaults and variables' })
  template(@Param('event') event: string) {
    return this.settings.template(event);
  }

  @ResponseMessage('Template saved.')
  @Put('templates/:event')
  @RequirePermission('comms.school')
  @ApiOperation({ summary: 'Reword an event’s messages (only the channels sent change)' })
  @ApiUnprocessableEntityResponse({ description: 'Missing text, unknown [variable], SMS too long' })
  saveTemplate(@Param('event') event: string, @Body() dto: TemplateDto) {
    return this.settings.saveTemplate(event, dto);
  }

  @ResponseMessage('Template reset to the default wording.')
  @Post('templates/:event/reset')
  @HttpCode(200)
  @RequirePermission('comms.school')
  @ApiOperation({ summary: 'Go back to EduTrack’s default wording' })
  @ApiConflictResponse({ description: 'TEMPLATE_IS_DEFAULT' })
  resetTemplate(@Param('event') event: string) {
    return this.settings.resetTemplate(event);
  }

  @ResponseMessage('Events loaded.')
  @Get('events')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'Each automatic message: on or off, and its channels' })
  events() {
    return this.settings.events();
  }

  /* ---------------- Settings ---------------- */

  @ResponseMessage('Notification settings loaded.')
  @Get('settings')
  @RequirePermission('comms.view')
  @ApiOperation({
    summary: 'Events, sender ID, SMS units (balance and used this term), quiet hours, history',
  })
  getSettings() {
    return this.settings.settings();
  }

  @ResponseMessage('Notification settings saved.')
  @Put('settings/events')
  @RequirePermission('comms.school')
  @ApiOperation({
    summary: 'Switch events and their channels: { "<event>": { active, channels } }',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiConflictResponse({ description: 'NOTHING_CHANGED' })
  saveEvents(@Body() body: Record<string, unknown>) {
    return this.settings.saveEvents(body);
  }

  @ResponseMessage('Quiet hours saved.')
  @Put('settings/quiet-hours')
  @RequirePermission('comms.school')
  @ApiOperation({ summary: 'When SMS is held (school time); in-app and email aren’t' })
  @ApiConflictResponse({ description: 'NOTHING_CHANGED' })
  quietHours(@Body() dto: QuietHoursDto) {
    return this.settings.quietHours(dto);
  }

  @ResponseMessage('Sender ID requested. EduTrack will let you know once it’s approved.')
  @Post('settings/sender-id')
  @HttpCode(200)
  @RequirePermission('comms.school')
  @ApiOperation({
    summary: 'Ask EduTrack to register an SMS sender ID',
    description: 'SMS goes out as "EDUTRACK" until EduTrack approves it in the back office.',
  })
  @ApiConflictResponse({ description: 'SENDER_ID_PENDING, SENDER_ID_APPROVED' })
  senderId(@CurrentUser() auth: AuthUserContext, @Body() dto: SenderIdDto) {
    return this.settings.requestSenderId(auth, dto.name);
  }
}
