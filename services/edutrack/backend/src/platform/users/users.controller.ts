import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { ReasonDto } from '../schools/dto/schools.dto.js';
import { RecordIdPipe } from '../shared/params.js';
import { USER_NOT_FOUND } from '../shared/staff.js';
import {
  CreateRoleDto,
  OptionalReasonDto,
  UserDetailsDto,
  UserListQuery,
} from './dto/users.dto.js';
import { RolesService } from './roles.service.js';
import { UsersService } from './users.service.js';

const userId = new RecordIdPipe(USER_NOT_FOUND);

@ApiTags('platform · users')
@Controller('platform/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @PlatformOnly('Users.View')
  @ApiOperation({ summary: 'Back-office staff, filtered by role, status, created and last active' })
  list(@Query() query: UserListQuery) {
    return this.users.list(query);
  }

  @Post('invitations')
  @PlatformOnly('Users.Create')
  @ApiOperation({
    summary: 'Invite a staff member',
    description:
      'Creates the account (Invited) and emails an invitation. Someone who was deactivated is ' +
      'invited again on the same account. You can only give a role within your own access.',
  })
  @ApiConflictResponse({ description: 'USER_EXISTS' })
  invite(@Body() dto: UserDetailsDto) {
    return this.users.invite(dto);
  }

  @Get(':id')
  @PlatformOnly('Users.View')
  get(@Param('id', userId) id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  @PlatformOnly('Users.Edit')
  @ApiOperation({ summary: 'Edit details and role (not your own role)' })
  update(@Param('id', userId) id: string, @Body() dto: UserDetailsDto) {
    return this.users.update(id, dto);
  }

  @Get(':id/activity')
  @PlatformOnly('Users.View')
  activity(@Param('id', userId) id: string) {
    return this.users.activity(id);
  }

  @Get(':id/security')
  @PlatformOnly('Users.View')
  security(@Param('id', userId) id: string) {
    return this.users.security(id);
  }

  @Get(':id/open-issues')
  @PlatformOnly('Users.View')
  openIssues(@Param('id', userId) id: string) {
    return this.users.openIssues(id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @PlatformOnly('Users.Suspend')
  @ApiOperation({ summary: 'Suspend (signs them out everywhere)' })
  suspend(@Param('id', userId) id: string, @Body() dto: ReasonDto) {
    return this.users.act(id, 'suspend', dto.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @PlatformOnly('Users.Suspend')
  @ApiOperation({ summary: 'Reactivate a suspended user' })
  reactivate(@Param('id', userId) id: string, @Body() dto: OptionalReasonDto) {
    return this.users.act(id, 'reactivate', dto.reason);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @PlatformOnly('Users.Delete')
  @ApiOperation({ summary: 'Deactivate for good (they can be invited again)' })
  deactivate(@Param('id', userId) id: string, @Body() dto: ReasonDto) {
    return this.users.act(id, 'deactivate', dto.reason);
  }

  @Post(':id/password-reset')
  @HttpCode(200)
  @PlatformOnly('Users.Edit')
  @ApiOperation({ summary: 'Email a password reset link' })
  passwordReset(@Param('id', userId) id: string, @Body() dto: OptionalReasonDto) {
    return this.users.act(id, 'password-reset', dto.reason);
  }

  @Post(':id/sign-out')
  @HttpCode(200)
  @PlatformOnly('Users.Edit')
  @ApiOperation({ summary: 'End every back-office session (yours: all but this one)' })
  signOut(@Param('id', userId) id: string, @Body() dto: OptionalReasonDto) {
    return this.users.act(id, 'sign-out', dto.reason);
  }

  @Post(':id/resend-invitation')
  @HttpCode(200)
  @PlatformOnly('Users.Create')
  resendInvitation(@Param('id', userId) id: string, @Body() dto: OptionalReasonDto) {
    return this.users.act(id, 'resend-invitation', dto.reason);
  }

  @Post(':id/revoke-invitation')
  @HttpCode(200)
  @PlatformOnly('Users.Create')
  revokeInvitation(@Param('id', userId) id: string, @Body() dto: OptionalReasonDto) {
    return this.users.act(id, 'revoke-invitation', dto.reason);
  }
}

@ApiTags('platform · users')
@Controller('platform/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'Roles with their permissions and how many people hold each' })
  list() {
    return this.roles.list();
  }

  @Post()
  @PlatformOnly('Users.Manage')
  @ApiConflictResponse({ description: 'ROLE_NAME_TAKEN' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Delete(':id')
  @PlatformOnly('Users.Manage')
  @ApiOperation({ summary: 'Delete a custom role nobody holds' })
  @ApiConflictResponse({ description: 'ROLE_PREDEFINED, ROLE_IN_USE' })
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
