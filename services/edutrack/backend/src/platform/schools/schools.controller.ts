import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { RecordIdPipe, schoolId } from '../shared/params.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import {
  BulkSuspendDto,
  InviteSchoolAdminDto,
  ProvisionSchoolDto,
  ReasonDto,
  RemindersDto,
  SchoolListQuery,
  SubscriptionActionDto,
  UpdateSchoolDto,
} from './dto/schools.dto.js';
import { ProvisioningService } from './provisioning.service.js';
import { SchoolsService } from './schools.service.js';

const adminId = new RecordIdPipe('That administrator doesn’t exist.');

@ApiTags('platform · schools')
@Controller('platform/schools')
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly provisioning: ProvisioningService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'Schools, filtered by status, plan and state, newest first' })
  list(@Query() query: SchoolListQuery) {
    return this.schools.list(query);
  }

  @Post()
  @PlatformOnly('Schools.Create')
  @ApiOperation({
    summary: 'Provision a school',
    description:
      'Creates the school (Onboarding), its sections, branches, predefined roles, subscription ' +
      'and first invoice, and emails its first administrators an invitation.',
  })
  @ApiCreatedResponse({ description: 'The new school' })
  @ApiConflictResponse({ description: 'SCHOOL_EXISTS' })
  provision(@Body() dto: ProvisionSchoolDto) {
    return this.provisioning.provision(dto);
  }

  @Post('bulk-suspend')
  @HttpCode(200)
  @PlatformOnly('Schools.Suspend')
  @ApiOperation({
    summary: 'Suspend several schools with one reason (already suspended ones are skipped)',
  })
  bulkSuspend(@Body() dto: BulkSuspendDto) {
    return this.schools.bulkSuspend(dto);
  }

  @Post('reminders')
  @HttpCode(200)
  @PlatformOnly('Subscriptions.Edit')
  @ApiOperation({ summary: 'Email renewal reminders to the schools’ billing contacts' })
  reminders(@Body() dto: RemindersDto) {
    return this.schools.sendReminders(dto.ids);
  }

  @Get(':id')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'One school' })
  get(@Param('id', schoolId) id: string) {
    return this.schools.get(id);
  }

  @Patch(':id')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Edit the display name, contact email, phone and state' })
  update(@Param('id', schoolId) id: string, @Body() dto: UpdateSchoolDto) {
    return this.schools.update(id, dto);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @PlatformOnly('Schools.Suspend')
  @ApiOperation({
    summary: 'Suspend a school',
    description: 'Everyone at the school is signed out and can’t sign in until it is reactivated.',
  })
  @ApiConflictResponse({ description: 'ALREADY_SUSPENDED' })
  suspend(@Param('id', schoolId) id: string, @Body() dto: ReasonDto) {
    return this.schools.suspend(id, dto.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @PlatformOnly('Schools.Suspend')
  @ApiOperation({ summary: 'Lift a suspension (back to the status it had before)' })
  @ApiConflictResponse({ description: 'NOT_SUSPENDED' })
  reactivate(@Param('id', schoolId) id: string) {
    return this.schools.reactivate(id);
  }

  @Post(':id/support-sessions')
  @PlatformOnly('Schools.View', 'Support.Create')
  @ApiOperation({ summary: 'Open 30 minutes of read-only access to the school’s portal' })
  supportSession(
    @Param('id', schoolId) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.schools.startSupportSession(id, dto.reason, user.userId);
  }

  @Get(':id/administrators')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'The school’s owners and School Admins, with pending invitations' })
  administrators(@Param('id', schoolId) id: string) {
    return this.schools.administrators(id);
  }

  @Post(':id/administrators')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Invite an Owner or School Admin' })
  @ApiConflictResponse({ description: 'ALREADY_MEMBER' })
  inviteAdmin(@Param('id', schoolId) id: string, @Body() dto: InviteSchoolAdminDto) {
    return this.schools.inviteAdminAndSend(id, dto);
  }

  @Post(':id/administrators/:adminId/resend')
  @HttpCode(200)
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Resend a pending administrator invitation (new link, 7 more days)' })
  resendInvite(@Param('id', schoolId) id: string, @Param('adminId', adminId) membershipId: string) {
    return this.schools.resendAdminInvite(id, membershipId);
  }

  @Get(':id/usage')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'Active staff, parent sign-ins (30 days), SMS this week, storage' })
  usage(@Param('id', schoolId) id: string) {
    return this.schools.usage(id);
  }

  @Get(':id/billing')
  @PlatformOnly('Schools.View', 'Subscriptions.View')
  @ApiOperation({ summary: 'EduTrack’s invoices to the school' })
  billing(@Param('id', schoolId) id: string) {
    return this.schools.billing(id);
  }

  @Get(':id/activity')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'Timeline of what happened to the school' })
  activity(@Param('id', schoolId) id: string) {
    return this.schools.activity(id);
  }

  @Get(':id/audit')
  @PlatformOnly('Schools.View', 'Audit.View')
  @ApiOperation({ summary: 'Audit entries for the school' })
  audit(@Param('id', schoolId) id: string) {
    return this.schools.auditLog(id);
  }

  @Get(':id/subscription')
  @PlatformOnly('Schools.View', 'Subscriptions.View')
  @ApiOperation({ summary: 'The school’s plan, price, limits, renewal and payment status' })
  subscription(@Param('id', schoolId) id: string) {
    return this.subscriptions.forSchool(id);
  }

  @Post(':id/subscription/actions')
  @HttpCode(200)
  @PlatformOnly('Subscriptions.Edit')
  @ApiOperation({
    summary: 'Change plan, extend, start grace, restrict, cancel or reactivate',
    description: 'restrict and cancel also need Subscriptions.Suspend.',
  })
  subscriptionAction(
    @Param('id', schoolId) id: string,
    @Body() dto: SubscriptionActionDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.subscriptions.act(id, dto, user);
  }
}
