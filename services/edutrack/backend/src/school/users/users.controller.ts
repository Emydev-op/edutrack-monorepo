import { SchoolWide } from '../../common/plan/branch-scope.js';
import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { AccessDto, InviteUserDto, UserActionDto } from './dto/users.dto.js';
import { SchoolUserDetailDto, SchoolUserRowDto, StaffOptionDto } from './dto/users.responses.js';
import { SchoolUsersService, type UserAction } from './users.service.js';

type Row = { name: string; email: string };

const STATUS_CONFLICT = 'INVALID_STATUS (not possible in this status), SELF_LOCKOUT, LAST_ADMIN';

@ApiTags('school · users')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('users')
export class SchoolUsersController {
  constructor(private readonly users: SchoolUsersService) {}

  @ResponseMessage('Users loaded.')
  @Get()
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Staff accounts with their roles, branch access and status' })
  @ApiOkResponse({ type: [SchoolUserRowDto] })
  list() {
    return this.users.list();
  }

  @ResponseMessage((u: Row) => `Invitation sent to ${u.email}.`)
  @Post('invitations')
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Invite someone (optionally linked to a staff record)',
    description:
      'Creates the account in Invited state and emails the shared invitation link ' +
      '(`/v1/auth/invitations/:token`). Someone deactivated or revoked is invited again on the ' +
      'same account. The Owner role can’t be given by invitation.',
  })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN, STAFF_HAS_ACCOUNT' })
  @ApiBadGatewayResponse({ description: 'INVITATION_NOT_SENT' })
  invite(@Body() dto: InviteUserDto) {
    return this.users.invite(dto);
  }

  @ResponseMessage('User loaded.')
  @Get(':id')
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'A user with what their roles allow and their history' })
  @ApiOkResponse({ type: SchoolUserDetailDto })
  @ApiNotFoundResponse({ description: 'This user doesn’t exist.' })
  get(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @ResponseMessage((u: Row) => `${u.name}’s access updated.`)
  @Patch(':id/access')
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Change roles and branch access',
    description:
      'You can’t remove your own School Admin role or your own access to Users; only an Owner ' +
      'can give or remove the Owner role; the school always keeps an active Owner or School Admin.',
  })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'SELF_LOCKOUT, LAST_ADMIN' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY' })
  updateAccess(@Param('id') id: string, @Body() dto: AccessDto) {
    return this.users.updateAccess(id, dto);
  }

  private act(id: string, action: UserAction, dto: UserActionDto) {
    return this.users.act(id, action, dto.reason);
  }

  @ResponseMessage((u: Row) => `${u.name} suspended.`)
  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Suspend (a reason is required; ends their sessions at this school)' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: STATUS_CONFLICT })
  suspend(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'suspend', dto);
  }

  @ResponseMessage((u: Row) => `${u.name} reactivated.`)
  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Reactivate a suspended account' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'INVALID_STATUS' })
  reactivate(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'reactivate', dto);
  }

  @ResponseMessage((u: Row) => `${u.name}’s account deactivated.`)
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Deactivate (ends their sessions; they can be invited again)' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: STATUS_CONFLICT })
  deactivate(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'deactivate', dto);
  }

  @ResponseMessage((u: Row) => `Reset link sent to ${u.email}.`)
  @Post(':id/password-reset')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Email a password reset link' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'INVALID_STATUS, NO_PASSWORD' })
  passwordReset(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'password-reset', dto);
  }

  @ResponseMessage((u: Row) => `Invitation resent to ${u.email}.`)
  @Post(':id/resend')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Resend the invitation with a fresh link' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'INVALID_STATUS' })
  resend(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'resend', dto);
  }

  @ResponseMessage('Invitation revoked.')
  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Withdraw a pending invitation (the link stops working)' })
  @ApiOkResponse({ type: SchoolUserRowDto })
  @ApiConflictResponse({ description: 'INVALID_STATUS' })
  revoke(@Param('id') id: string, @Body() dto: UserActionDto) {
    return this.act(id, 'revoke', dto);
  }
}

@ApiTags('school · users')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('staff')
export class StaffOptionsController {
  constructor(private readonly users: SchoolUsersService) {}

  @ResponseMessage('Staff loaded.')
  @Get('options')
  @ApiOperation({
    summary: 'Current staff for pickers (branch head, position holders, invites)',
    description:
      'Needs any of settings.users, settings.roles, settings.branches or settings.profile: the ' +
      'picker is shared by those screens.',
  })
  @ApiOkResponse({ type: [StaffOptionDto] })
  @ApiForbiddenResponse({
    description:
      'Needs one of: settings.users, settings.roles, settings.branches, settings.profile',
  })
  async options() {
    await this.users.requireAny([
      'settings.users',
      'settings.roles',
      'settings.branches',
      'settings.profile',
    ]);
    return this.users.staffOptions();
  }
}
