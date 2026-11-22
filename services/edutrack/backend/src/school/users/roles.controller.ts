import { SchoolWide } from '../../common/plan/branch-scope.js';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RoleDto } from './dto/users.dto.js';
import { OkDto, RoleResponseDto } from './dto/users.responses.js';
import { SchoolRolesService } from './roles.service.js';
import { SchoolUsersService } from './users.service.js';

const READERS = ['settings.users', 'settings.roles'];

@ApiTags('school · roles')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('roles')
export class SchoolRolesController {
  constructor(
    private readonly roles: SchoolRolesService,
    private readonly users: SchoolUsersService,
  ) {}

  @ResponseMessage('Roles loaded.')
  @Get()
  @ApiOperation({
    summary: 'Predefined and custom roles with how many people hold each',
    description: 'Needs settings.users or settings.roles (the access form lists the roles).',
  })
  @ApiOkResponse({ type: [RoleResponseDto] })
  @ApiForbiddenResponse({ description: 'Needs one of: settings.users, settings.roles' })
  async list() {
    await this.users.requireAny(READERS);
    return this.roles.list();
  }

  @ResponseMessage('Role created. Assign it from a user’s access settings.')
  @Post()
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Create a custom role' })
  @ApiOkResponse({ type: RoleResponseDto })
  create(@Body() dto: RoleDto) {
    return this.roles.create(dto);
  }

  @ResponseMessage('Role loaded.')
  @Get(':id')
  @ApiOperation({ summary: 'A role', description: 'Needs settings.users or settings.roles.' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ description: 'This role doesn’t exist.' })
  @ApiForbiddenResponse({ description: 'Needs one of: settings.users, settings.roles' })
  async get(@Param('id') id: string) {
    await this.users.requireAny(READERS);
    return this.roles.get(id);
  }

  @ResponseMessage((r: RoleResponseDto) =>
    r.users
      ? `Role saved. ${r.users} user${r.users === 1 ? '’s' : 's’'} access updated.`
      : 'Role saved. No users have this role yet.',
  )
  @Patch(':id')
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Edit a custom role (applies to its holders at once)' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiConflictResponse({ description: 'ROLE_LOCKED (predefined), SELF_LOCKOUT' })
  update(@Param('id') id: string, @Body() dto: RoleDto) {
    return this.roles.update(id, dto);
  }

  @ResponseMessage('Role deleted.')
  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Delete a custom role nobody holds' })
  @ApiOkResponse({ type: OkDto })
  @ApiConflictResponse({ description: 'ROLE_LOCKED (predefined), ROLE_IN_USE' })
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
