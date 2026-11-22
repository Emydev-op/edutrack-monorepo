import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../shared/params.js';
import { GroupsService } from './groups.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const groupId = new RecordIdPipe('Group not found');
const anyId = new RecordIdPipe('Not found');

export class GroupNameDto {
  @ApiProperty({ example: 'Greenfield Education Group' })
  @Transform(trim)
  @MaxLength(120)
  @IsString()
  name!: string;
}

export class GroupSchoolDto {
  @ApiProperty() @IsString() schoolId!: string;
}

export class GroupStaffDto {
  @ApiProperty({ example: 'Mrs. Adaeze Okonkwo' })
  @Transform(trim)
  @MaxLength(120)
  @IsString()
  name!: string;

  @ApiProperty({ example: 'proprietor@greenfield.ng' })
  @Transform(trim)
  @MaxLength(200)
  @IsString()
  email!: string;

  @ApiProperty({ enum: ['Group owner', 'Group finance', 'Group academic'] })
  @IsString()
  role!: string;
}

export class GroupStaffRoleDto {
  @ApiProperty({ enum: ['Group owner', 'Group finance', 'Group academic'] })
  @IsString()
  role!: string;
}

/** Back office › Groups: a proprietor's schools under one group, and the group's staff. */
@ApiTags('platform · groups')
@Controller('platform/groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @ResponseMessage('Groups loaded.')
  @Get()
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'School groups with their school and staff counts' })
  list() {
    return this.groups.list();
  }

  @ResponseMessage((g: { name: string }) => `${g.name} created.`)
  @Post()
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Create a school group' })
  @ApiConflictResponse({ description: 'GROUP_NAME_TAKEN' })
  create(@Body() dto: GroupNameDto) {
    return this.groups.create(dto.name);
  }

  @ResponseMessage('Group loaded.')
  @Get(':id')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'A group with its schools and staff' })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND' })
  get(@Param('id', groupId) id: string) {
    return this.groups.get(id);
  }

  @ResponseMessage('Group renamed.')
  @Put(':id')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Rename a group' })
  rename(@Param('id', groupId) id: string, @Body() dto: GroupNameDto) {
    return this.groups.rename(id, dto.name);
  }

  @ResponseMessage('School added to the group.')
  @Post(':id/schools')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({
    summary: 'Add a school (its group staff get accounts there at once)',
  })
  @ApiConflictResponse({ description: 'SCHOOL_IN_GROUP' })
  addSchool(@Param('id', groupId) id: string, @Body() dto: GroupSchoolDto) {
    return this.groups.addSchool(id, dto.schoolId);
  }

  @ResponseMessage('School removed from the group.')
  @Delete(':id/schools/:schoolId')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Remove a school (group accounts there are deactivated)' })
  removeSchool(@Param('id', groupId) id: string, @Param('schoolId', anyId) schoolId: string) {
    return this.groups.removeSchool(id, schoolId);
  }

  @ResponseMessage('Added to the group’s staff.')
  @Post(':id/staff')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({
    summary: 'Add group staff: an account in every school of the group (new people are invited)',
  })
  @ApiConflictResponse({ description: 'GROUP_STAFF_EXISTS' })
  addStaff(@Param('id', groupId) id: string, @Body() dto: GroupStaffDto) {
    return this.groups.addStaff(id, dto);
  }

  @ResponseMessage('Group role changed.')
  @Put(':id/staff/:staffId')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Change a group staff member’s role' })
  updateStaff(
    @Param('id', groupId) id: string,
    @Param('staffId', anyId) staffId: string,
    @Body() dto: GroupStaffRoleDto,
  ) {
    return this.groups.updateStaff(id, staffId, dto.role);
  }

  @ResponseMessage('Removed from the group’s staff.')
  @Delete(':id/staff/:staffId')
  @PlatformOnly('Schools.Edit')
  @ApiOperation({ summary: 'Remove group staff (their group accounts are deactivated)' })
  removeStaff(@Param('id', groupId) id: string, @Param('staffId', anyId) staffId: string) {
    return this.groups.removeStaff(id, staffId);
  }
}
