import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { SchoolWide } from '../../common/plan/branch-scope.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { StaffImportDto } from '../staff/dto/staff.dto.js';
import { BoardingService } from './boarding.service.js';
import { BoardersService } from './boarders.service.js';
import { BoardingFeesService } from './boarding-fees.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { HostelImportService } from './hostel-import.service.js';
import { MyHostelService } from './my-hostel.service.js';
import { BoardingAlertsService } from './boarding-alerts.service.js';
import { ExeatsService } from './exeats.service.js';
import { RollCallsService } from './roll-calls.service.js';
import { SickBayService } from './sick-bay.service.js';
import { HouseLifeService } from './house-life.service.js';
import {
  AdminExeatsController,
  ParentExeatsController,
  StaffExeatsController,
} from './exeats.controller.js';
import { AuthModule } from '../../auth/auth.module.js';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';

class SectionBoardingDto {
  @ApiProperty() @IsString() sectionId!: string;
  @ApiProperty() @IsBoolean() boarding!: boolean;
  @ApiPropertyOptional({
    type: [String],
    description: 'Only these class levels board (empty: all)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  levelIds?: string[];
}
class CampusBoardingDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty({ type: [SectionBoardingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionBoardingDto)
  sections!: SectionBoardingDto[];
}
export class BoardingSettingsDto {
  @ApiProperty({ type: [CampusBoardingDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CampusBoardingDto)
  campuses!: CampusBoardingDto[];
}

export class HostelDto {
  @ApiProperty({ description: 'The campus' }) @IsString() branchId!: string;
  @ApiProperty({ example: 'Queen Amina House' }) @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ enum: ['Boys', 'Girls', 'Mixed'] }) @IsString() gender!: string;
  @ApiPropertyOptional({
    type: [String],
    description: 'Class levels it takes (empty: all boarding levels)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  levelIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class CopyHostelDto {
  @ApiProperty({ example: 'Queen Idia House' }) @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional({ enum: ['Boys', 'Girls', 'Mixed'] })
  @IsOptional()
  @IsString()
  gender?: string;
}
export class FloorDto {
  @ApiProperty({ example: 'Ground floor' }) @IsString() @MaxLength(60) name!: string;
}
export class RoomDto {
  @ApiProperty({ example: 'Room 4' }) @IsString() @MaxLength(60) name!: string;
  @ApiProperty({ example: 4 }) @IsInt() capacity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() floorId?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'One label per place, or none' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  beds?: string[];
}
export class GenerateRoomsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() floorId?: string | null;
  @ApiProperty({ example: 10 }) @IsInt() count!: number;
  @ApiPropertyOptional({ example: 'Room' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  prefix?: string;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() startAt?: number;
  @ApiProperty({ example: 4 }) @IsInt() capacity!: number;
  @ApiPropertyOptional({ enum: ['none', 'numbers', 'letters'] })
  @IsOptional()
  @IsIn(['none', 'numbers', 'letters'])
  bedStyle?: 'none' | 'numbers' | 'letters';
}
class StaffEntryDto {
  @ApiProperty() @IsString() staffId!: string;
  @ApiProperty({ enum: ['House master / mistress', 'Floor master / mistress', 'Assistant'] })
  @IsString()
  role!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floorId?: string | null;
}
export class HostelStaffDto {
  @ApiProperty({ type: [StaffEntryDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StaffEntryDto)
  entries!: StaffEntryDto[];
}

export class StudentBoardingDto {
  @ApiProperty({ description: 'Boarder (true) or day student (false) this session' })
  @IsBoolean()
  boarding!: boolean;
  @ApiPropertyOptional({ description: 'Place them in this room at the same time' })
  @IsOptional()
  @IsString()
  roomId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() bed?: string | null;
  @ApiPropertyOptional({ description: 'Go ahead despite warnings (other gender, other classes)' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
export class MarkBoardersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  studentIds!: string[];
  @ApiProperty() @IsBoolean() boarding!: boolean;
}
export class AllocateDto {
  @ApiProperty() @IsString() studentId!: string;
  @ApiProperty() @IsString() roomId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bed?: string | null;
  @ApiPropertyOptional({ description: 'Go ahead despite warnings (other gender, other classes)' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
export class AutoAllocateDto {
  @ApiPropertyOptional({ description: 'Keep classmates in the same rooms (else mix classes)' })
  @IsOptional()
  @IsBoolean()
  keepClassmates?: boolean;
}

/** School Admin › Boarding (`/v1/boarding`): where boarders are taken, and the hostels. */
@ApiTags('school · boarding')
@Portals('SCHOOL_ADMIN')
@Controller('boarding')
export class BoardingController {
  constructor(
    private readonly boarding: BoardingService,
    private readonly imports: HostelImportService,
    private readonly boarders: BoardersService,
  ) {}

  /* ---------------- Boarders ---------------- */

  @ResponseMessage('Boarders loaded.')
  @Get('boarders')
  @RequirePermission('boarding.view')
  @ApiOperation({
    summary: 'This session’s boarders and where each sleeps (or that they need a place)',
  })
  boarderList(
    @Query('branchId') branchId?: string,
    @Query('hostelId') hostelId?: string,
    @Query('levelId') levelId?: string,
    @Query('unplaced') unplaced?: string,
    @Query('q') q?: string,
  ) {
    return this.boarders.boarders({
      branchId,
      hostelId,
      levelId,
      unplaced: unplaced === 'true',
      q,
    });
  }

  @ResponseMessage('Boarding loaded.')
  @Get('students/:studentId')
  @RequirePermission('boarding.view')
  @ApiOperation({
    summary: 'A student’s boarding this session: can they board, do they, and where',
  })
  studentBoarding(@Param('studentId') studentId: string) {
    return this.boarders.student(studentId);
  }

  @ResponseMessage(
    (r: { name: string; status: string }) =>
      `${r.name} is now a ${r.status === 'Boarder' ? 'boarder' : 'day student'}.`,
  )
  @Put('students/:studentId')
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary: 'Make a student a boarder or a day student this session (optionally placing them)',
    description:
      'Only where their campus and class take boarders. Becoming a day student frees their bed. ' +
      '409 ALLOCATION_WARNING lists warnings (other gender, other classes) to confirm with `confirm`.',
  })
  setStudentBoarding(@Param('studentId') studentId: string, @Body() dto: StudentBoardingDto) {
    return this.boarders.setStatus(studentId, dto);
  }

  @ResponseMessage(
    (r: { changed: number }) => `${r.changed} student${r.changed === 1 ? '' : 's'} updated.`,
  )
  @Post('students/mark')
  @HttpCode(200)
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Mark several students as boarders or day students at once' })
  markBoarders(@Body() dto: MarkBoardersDto) {
    return this.boarders.markMany(dto.studentIds, dto.boarding);
  }

  @ResponseMessage('Place saved.')
  @Put('allocations')
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary: 'Give a boarder a room (and bed), or move them',
    description:
      '409 ROOM_FULL or BED_TAKEN are refusals. 409 ALLOCATION_WARNING (other gender, other ' +
      'classes) can be overridden by sending `confirm: true`.',
  })
  allocate(@Body() dto: AllocateDto) {
    return this.boarders.allocate(dto);
  }

  @ResponseMessage('Place removed.')
  @Delete('allocations/:studentId')
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Take a boarder out of their room (they stay a boarder)' })
  unallocate(@Param('studentId') studentId: string) {
    return this.boarders.unallocate(studentId);
  }

  @ResponseMessage('Rooms loaded.')
  @Get('hostels/:id/occupancy')
  @RequirePermission('boarding.view')
  @ApiOperation({ summary: 'A hostel’s rooms with who sleeps in each this session' })
  occupancy(@Param('id') id: string) {
    return this.boarders.occupancy(id);
  }

  @ResponseMessage(
    (r: { placed: number; waiting: number }) =>
      `${r.placed} boarder${r.placed === 1 ? '' : 's'} placed.${r.waiting ? ` ${r.waiting} still waiting for space.` : ''}`,
  )
  @Post('hostels/:id/auto-allocate')
  @HttpCode(200)
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary:
      'Fill free places with boarders who have none, matching the hostel’s gender and classes',
  })
  autoAllocate(@Param('id') id: string, @Body() dto: AutoAllocateDto) {
    return this.boarders.autoAllocate(id, dto);
  }

  @ResponseMessage('Boarding set-up loaded.')
  @Get('settings')
  @RequirePermission('boarding.view')
  @ApiOperation({
    summary: 'Each campus’s sections and class levels, and which take boarders',
    description: '`enabled` is true when any section at any campus takes boarders.',
  })
  settings() {
    return this.boarding.settings();
  }

  @ResponseMessage('Boarding set-up saved.')
  @Put('settings')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary:
      'Turn boarding on or off for each section at each campus (optionally only some levels)',
  })
  saveSettings(@Body() dto: BoardingSettingsDto) {
    return this.boarding.saveSettings(dto.campuses);
  }

  /* ---------------- Rooms bulk upload (static paths before :id) ---------------- */

  @RawResponse()
  @Get('rooms/import/template')
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'The hostel rooms template (.xlsx): one row per room' })
  async template() {
    return new StreamableFile(await this.imports.template(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="edutrack-hostel-rooms-template.xlsx"',
    });
  }

  @ResponseMessage('File checked.')
  @Post('rooms/import')
  @HttpCode(200)
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Check a rooms file; hostels and floors not there yet will be added' })
  previewImport(@Body() dto: StaffImportDto) {
    return this.imports.preview(dto);
  }

  @ResponseMessage(
    (r: { imported: number; skipped: number }) =>
      `${r.imported} room${r.imported === 1 ? '' : 's'} imported.${r.skipped ? ` ${r.skipped} skipped.` : ''}`,
  )
  @Post('rooms/import/:id/commit')
  @HttpCode(200)
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Import the checked file' })
  commitImport(@Param('id') id: string) {
    return this.imports.commit(id);
  }

  /* ---------------- Hostels ---------------- */

  @ResponseMessage('Hostels loaded.')
  @Get('hostels')
  @RequirePermission('boarding.view')
  @ApiOperation({
    summary: 'Every hostel with its campus, who it houses, floors, rooms, places and staff',
  })
  hostels(@Query('branchId') branchId?: string) {
    return this.boarding.hostels(branchId || null);
  }

  @ResponseMessage((r: { name: string }) => `${r.name} added.`)
  @Post('hostels')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Add a hostel at a campus that takes boarders' })
  createHostel(@Body() dto: HostelDto) {
    return this.boarding.createHostel(dto);
  }

  @ResponseMessage('Hostel loaded.')
  @Get('hostels/:id')
  @RequirePermission('boarding.view')
  @ApiOperation({ summary: 'One hostel with its floors, rooms and house staff' })
  hostel(@Param('id') id: string) {
    return this.boarding.hostel(id);
  }

  @ResponseMessage((r: { name: string }) => `${r.name} saved.`)
  @Put('hostels/:id')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Change a hostel’s name, boys/girls/mixed, classes or note' })
  updateHostel(@Param('id') id: string, @Body() dto: HostelDto) {
    return this.boarding.updateHostel(id, dto);
  }

  @ResponseMessage((r: { name: string }) => `${r.name} removed.`)
  @Delete('hostels/:id')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Remove a hostel (kept in history)' })
  removeHostel(@Param('id') id: string) {
    return this.boarding.removeHostel(id);
  }

  @ResponseMessage((r: { name: string }) => `${r.name} added.`)
  @Post('hostels/:id/copy')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'A new hostel with the same floors and rooms (no staff)' })
  copyHostel(@Param('id') id: string, @Body() dto: CopyHostelDto) {
    return this.boarding.copyHostel(id, dto);
  }

  @ResponseMessage('Floor added.')
  @Post('hostels/:id/floors')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Add a floor, wing or block' })
  addFloor(@Param('id') id: string, @Body() dto: FloorDto) {
    return this.boarding.addFloor(id, dto.name);
  }

  @ResponseMessage('Floor renamed.')
  @Put('hostels/:id/floors/:floorId')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Rename a floor or wing' })
  renameFloor(@Param('id') id: string, @Param('floorId') floorId: string, @Body() dto: FloorDto) {
    return this.boarding.renameFloor(id, floorId, dto.name);
  }

  @ResponseMessage('Floor removed.')
  @Delete('hostels/:id/floors/:floorId')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Remove a floor; its rooms stay in the hostel' })
  removeFloor(@Param('id') id: string, @Param('floorId') floorId: string) {
    return this.boarding.removeFloor(id, floorId);
  }

  @ResponseMessage('Room added.')
  @Post('hostels/:id/rooms')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Add a room with its places and optional bed labels' })
  addRoom(@Param('id') id: string, @Body() dto: RoomDto) {
    return this.boarding.addRoom(id, dto);
  }

  @ResponseMessage((r: { totals: { rooms: number } }) => `Rooms added. ${r.totals.rooms} in all.`)
  @Post('hostels/:id/rooms/generate')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary: 'Add several rooms at once, e.g. Room 1–10 with 4 places each and beds A–D',
  })
  generateRooms(@Param('id') id: string, @Body() dto: GenerateRoomsDto) {
    return this.boarding.generateRooms(id, dto);
  }

  @ResponseMessage('Room saved.')
  @Put('hostels/:id/rooms/:roomId')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Change a room’s name, floor, places or bed labels' })
  updateRoom(@Param('id') id: string, @Param('roomId') roomId: string, @Body() dto: RoomDto) {
    return this.boarding.updateRoom(id, roomId, dto);
  }

  @ResponseMessage('Room removed.')
  @Delete('hostels/:id/rooms/:roomId')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({ summary: 'Remove a room' })
  removeRoom(@Param('id') id: string, @Param('roomId') roomId: string) {
    return this.boarding.removeRoom(id, roomId);
  }

  @ResponseMessage('House staff saved.')
  @Put('hostels/:id/staff')
  @SchoolWide()
  @RequirePermission('boarding.manage')
  @ApiOperation({
    summary: 'Set the hostel’s house staff: house master or mistress, floor masters, assistants',
  })
  setStaff(@Param('id') id: string, @Body() dto: HostelStaffDto) {
    return this.boarding.setStaff(id, dto.entries);
  }
}

/** Teacher Workspace › My hostel (`/v1/my-hostel`), for house staff. */
@ApiTags('teacher · boarding')
@Portals('TEACHER')
@Controller('my-hostel')
export class MyHostelController {
  constructor(private readonly hostels: MyHostelService) {}

  @ResponseMessage('Hostel loaded.')
  @Get()
  @ApiOperation({
    summary:
      'The hostels (or floors) the signed-in teacher looks after, with this session’s boarders',
    description: 'Empty `hostels` for staff who aren’t house staff.',
  })
  view(@CurrentUser() auth: AuthUserContext) {
    return this.hostels.view(auth);
  }
}

@Module({
  imports: [FinanceModule, AuthModule],
  controllers: [
    BoardingController,
    AdminExeatsController,
    MyHostelController,
    StaffExeatsController,
    ParentExeatsController,
  ],
  providers: [
    BoardingService,
    HostelImportService,
    BoardersService,
    BoardingFeesService,
    MyHostelService,
    ExeatsService,
    RollCallsService,
    SickBayService,
    HouseLifeService,
    BoardingAlertsService,
    SchoolAuditService,
  ],
  exports: [BoardingService, BoardersService, BoardingAlertsService],
})
export class BoardingModule {}
