import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { ExeatsService } from './exeats.service.js';
import { RollCallsService } from './roll-calls.service.js';
import { SickBayService } from './sick-bay.service.js';
import { HouseLifeService } from './house-life.service.js';
import { Put } from '@nestjs/common';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExeatRequestDto {
  @ApiProperty({ enum: ['Weekend', 'Medical', 'Family event', 'Emergency', 'Other'] })
  @IsString()
  kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) reason?: string;
  @ApiProperty({ example: '2026-12-04T15:00', description: 'Lagos time' })
  @IsString()
  leaveAt!: string;
  @ApiProperty({ example: '2026-12-06T18:00', description: 'Lagos time' })
  @IsString()
  returnBy!: string;
  @ApiPropertyOptional({ description: 'An approved pickup person (else a parent collects)' })
  @IsOptional()
  @IsString()
  pickupPersonId?: string | null;
}
export class StaffExeatDto extends ExeatRequestDto {
  @ApiProperty() @IsString() studentId!: string;
}
export class DecideExeatDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @ApiPropertyOptional({ description: 'Required when declining' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  note?: string;
}
export class TermBreakDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hostelId?: string | null;
  @ApiProperty() @IsString() leaveAt!: string;
  @ApiProperty() @IsString() returnBy!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) reason?: string;
}
export class SignOutDto {
  @ApiProperty({ description: '`pickup:<id>` or `guardian:<id>` from the exeat’s `collectors`' })
  @IsString()
  collector!: string;
}
export class VisitorDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @MaxLength(200) purpose!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string | null;
}
export class PickupDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ example: 'Uncle' }) @IsString() @MaxLength(60) relationship!: string;
  @ApiProperty({ example: '0803 555 0101' }) @IsString() phone!: string;
  @ApiPropertyOptional({ example: 'Driver, Toyota Corolla LND 123 XY' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

class RollMarkDto {
  @ApiProperty() @IsString() studentId!: string;
  @ApiProperty({ enum: ['Present', 'Absent', 'Excused'] }) @IsString() mark!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}
export class RollCallDto {
  @ApiPropertyOptional({ example: '2026-11-26', description: 'Today when empty' })
  @IsOptional()
  @IsString()
  date?: string;
  @ApiProperty({ example: 'Night' }) @IsString() slot!: string;
  @ApiProperty({ type: [RollMarkDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RollMarkDto)
  marks!: RollMarkDto[];
}
export class RollSlotsDto {
  @ApiProperty({ type: [String], example: ['Morning', 'Prep', 'Night'] })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  slots!: string[];
}
export class SickBayVisitDto {
  @ApiProperty() @IsString() studentId!: string;
  @ApiProperty() @IsString() @MaxLength(300) complaint!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) assessment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) treatment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) medication?: string;
  @ApiProperty({ enum: ['Back to class', 'Admitted', 'Sent home', 'Referred to hospital'] })
  @IsString()
  outcome!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @ApiPropertyOptional({ description: 'When they were seen (now when empty), Lagos time' })
  @IsOptional()
  @IsString()
  seenAt?: string | null;
}
export class DischargeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class VisitingDayDto {
  @ApiPropertyOptional({ description: 'The campus (all campuses when empty)' })
  @IsOptional()
  @IsString()
  branchId?: string | null;
  @ApiProperty({ example: '2026-12-12' }) @IsString() date!: string;
  @ApiProperty({ example: '10:00' }) @IsString() startsAt!: string;
  @ApiProperty({ example: '16:00' }) @IsString() endsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class IncidentDto {
  @ApiProperty() @IsString() studentId!: string;
  @ApiProperty({ example: 'Lateness' }) @IsString() category!: string;
  @ApiProperty() @IsString() @MaxLength(2000) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() occurredAt?: string | null;
  @ApiPropertyOptional({ description: 'Show it to the parents and tell them' })
  @IsOptional()
  @IsBoolean()
  shareWithParent?: boolean;
}
export class CloseIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) action?: string;
}
export class ChecklistDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  items!: string[];
}
class CheckItemDto {
  @ApiProperty() @IsString() item!: string;
  @ApiProperty() @IsBoolean() present!: boolean;
  @ApiPropertyOptional() @IsOptional() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) note?: string;
}
export class PropertyCheckDto {
  @ApiProperty({ enum: ['Check-in', 'Check-out'] }) @IsString() kind!: 'Check-in' | 'Check-out';
  @ApiProperty({ type: [CheckItemDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => CheckItemDto)
  items!: CheckItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** The exeat, gate, roll call and sick bay routes, shared by School Admin and the staff workspace. */
abstract class ExeatRoutes {
  constructor(
    protected readonly exeats: ExeatsService,
    protected readonly rollCalls: RollCallsService,
    protected readonly sickBay: SickBayService,
    protected readonly house: HouseLifeService,
  ) {}

  /* ---------------- Dashboard, visiting days, incidents, property ---------------- */

  @ResponseMessage('Boarding loaded.')
  @Get('dashboard')
  @ApiOperation({ summary: 'The boarding house at a glance (your hostels, or all for the Head)' })
  dashboard(@CurrentUser() auth: AuthUserContext) {
    return this.house.dashboard(auth);
  }

  @ResponseMessage('Students loaded.')
  @Get('students')
  @ApiOperation({
    summary: 'Students to pick: boarders in your hostels, or anyone for the nurse and the Head',
  })
  students(
    @CurrentUser() auth: AuthUserContext,
    @Query('q') q?: string,
    @Query('boarders') boarders?: string,
  ) {
    return this.house.students(auth, { q, boarders: boarders === 'true' });
  }

  @ResponseMessage('Visiting days loaded.')
  @Get('visiting-days')
  @ApiOperation({ summary: 'Upcoming visiting days' })
  visitingDays() {
    return this.house.visitingDays();
  }

  @ResponseMessage('Visiting day added.')
  @Post('visiting-days')
  @ApiOperation({ summary: 'Add a visiting day (boarders’ parents are told)' })
  addVisitingDay(@CurrentUser() auth: AuthUserContext, @Body() dto: VisitingDayDto) {
    return this.house.addVisitingDay(auth, dto);
  }

  @ResponseMessage('Visiting day removed.')
  @Delete('visiting-days/:id')
  @ApiOperation({ summary: 'Remove a visiting day' })
  removeVisitingDay(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.house.removeVisitingDay(auth, id);
  }

  @ResponseMessage('Incidents loaded.')
  @Get('incidents')
  @ApiOperation({ summary: 'Hostel incidents in the hostels you see' })
  incidents(
    @CurrentUser() auth: AuthUserContext,
    @Query('studentId') studentId?: string,
    @Query('hostelId') hostelId?: string,
    @Query('status') status?: string,
  ) {
    return this.house.incidents(auth, { studentId, hostelId, status });
  }

  @ResponseMessage('Incident recorded.')
  @Post('incidents')
  @ApiOperation({ summary: 'Record a hostel incident (optionally shared with the parents)' })
  recordIncident(@CurrentUser() auth: AuthUserContext, @Body() dto: IncidentDto) {
    return this.house.recordIncident(auth, dto);
  }

  @ResponseMessage('Incident closed.')
  @Post('incidents/:id/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close a hostel incident' })
  closeIncident(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CloseIncidentDto,
  ) {
    return this.house.closeIncident(auth, id, dto.action);
  }

  @ResponseMessage('Checklist loaded.')
  @Get('checklist')
  @ApiOperation({ summary: 'What boarders bring, checked at resumption and departure' })
  checklist() {
    return this.house.checklist();
  }

  @ResponseMessage('Checklist saved.')
  @Put('checklist')
  @ApiOperation({ summary: 'Set the property checklist (Head of boarding)' })
  setChecklist(@CurrentUser() auth: AuthUserContext, @Body() dto: ChecklistDto) {
    return this.house.setChecklist(auth, dto.items);
  }

  @ResponseMessage('Property checks loaded.')
  @Get('students/:studentId/property')
  @ApiOperation({ summary: 'A boarder’s property check-in and check-out this term' })
  property(@CurrentUser() auth: AuthUserContext, @Param('studentId') studentId: string) {
    return this.house.staffPropertyChecks(auth, studentId);
  }

  @ResponseMessage('Property check saved.')
  @Put('students/:studentId/property')
  @ApiOperation({ summary: 'Save a boarder’s property check-in or check-out' })
  saveProperty(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Body() dto: PropertyCheckDto,
  ) {
    return this.house.saveCheck(auth, studentId, dto);
  }

  /* ---------------- Roll calls ---------------- */

  @ResponseMessage('Roll calls loaded.')
  @Get('roll-calls')
  @ApiOperation({
    summary: 'A day’s roll calls in the hostels you see: taken or not, and absences',
  })
  rollCallDay(@CurrentUser() auth: AuthUserContext, @Query('date') date?: string) {
    return this.rollCalls.day(auth, { date });
  }

  @ResponseMessage('Roll call loaded.')
  @Get('roll-calls/:hostelId')
  @ApiOperation({
    summary:
      'A roll call sheet: boarders to mark, with exeats and the sick bay marked automatically',
  })
  rollCallSheet(
    @CurrentUser() auth: AuthUserContext,
    @Param('hostelId') hostelId: string,
    @Query('date') date?: string,
    @Query('slot') slot?: string,
  ) {
    return this.rollCalls.sheet(auth, hostelId, { date, slot });
  }

  @ResponseMessage('Roll call saved.')
  @Put('roll-calls/:hostelId')
  @ApiOperation({ summary: 'Save a roll call (absent boarders’ parents and house staff are told)' })
  saveRollCall(
    @CurrentUser() auth: AuthUserContext,
    @Param('hostelId') hostelId: string,
    @Body() dto: RollCallDto,
  ) {
    return this.rollCalls.save(auth, hostelId, dto);
  }

  @ResponseMessage('Roll calls saved.')
  @Put('roll-calls/:hostelId/slots')
  @ApiOperation({ summary: 'Set a hostel’s daily roll calls (Head of boarding)' })
  setSlots(
    @CurrentUser() auth: AuthUserContext,
    @Param('hostelId') hostelId: string,
    @Body() dto: RollSlotsDto,
  ) {
    return this.rollCalls.setSlots(auth, hostelId, dto.slots);
  }

  /* ---------------- Sick bay ---------------- */

  @ResponseMessage('Sick bay loaded.')
  @Get('sick-bay')
  @ApiOperation({ summary: 'Who is in the sick bay now, and recent visits' })
  sickBayList(
    @CurrentUser() auth: AuthUserContext,
    @Query('studentId') studentId?: string,
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
  ) {
    return this.sickBay.list(auth, { studentId, branchId, days });
  }

  @ResponseMessage('Visit recorded.')
  @Post('sick-bay')
  @ApiOperation({ summary: 'Record a sick bay visit (the parents are told)' })
  sickBayVisit(@CurrentUser() auth: AuthUserContext, @Body() dto: SickBayVisitDto) {
    return this.sickBay.record(auth, dto);
  }

  @ResponseMessage('Discharged.')
  @Post('sick-bay/:id/discharge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Discharge a student kept in the sick bay' })
  discharge(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: DischargeDto,
  ) {
    return this.sickBay.discharge(auth, id, dto.note);
  }

  /* ---------------- Exeats and the gate ---------------- */

  @ResponseMessage('Exeats loaded.')
  @Get('exeats')
  @ApiOperation({ summary: 'Exeats you can see (your hostels’, or all for the Head of boarding)' })
  list(
    @CurrentUser() auth: AuthUserContext,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('hostelId') hostelId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.exeats.list(auth, { status, branchId, hostelId, q, from, to });
  }

  @ResponseMessage('Exeat given.')
  @Post('exeats')
  @ApiOperation({ summary: 'Give a boarder an exeat (approved straight away)' })
  create(@CurrentUser() auth: AuthUserContext, @Body() dto: StaffExeatDto) {
    return this.exeats.create(auth, dto);
  }

  @ResponseMessage('Boarders sent home.')
  @Post('exeats/term-break')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send every boarder at a campus (or in a hostel) home for a break' })
  termBreak(@CurrentUser() auth: AuthUserContext, @Body() dto: TermBreakDto) {
    return this.exeats.termBreak(auth, dto);
  }

  @ResponseMessage('Gate loaded.')
  @Get('gate')
  @ApiOperation({ summary: 'Who leaves today, who is out (and overdue), and visitors on site' })
  gate(@CurrentUser() auth: AuthUserContext, @Query('branchId') branchId?: string) {
    return this.exeats.gate(auth, branchId || null);
  }

  @ResponseMessage('Visitor logged in.')
  @Post('gate/visitors')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log a visitor in at the gate' })
  visitor(@CurrentUser() auth: AuthUserContext, @Body() dto: VisitorDto) {
    return this.exeats.logVisitor(auth, dto);
  }

  @ResponseMessage('Visitor logged out.')
  @Post('gate/visitors/:id/out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log a visitor out' })
  visitorOut(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.exeats.visitorOut(auth, id);
  }

  @ResponseMessage('Exeat loaded.')
  @Get('exeats/:id')
  @ApiOperation({ summary: 'One exeat' })
  get(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.exeats.get(auth, id);
  }

  @ResponseMessage((r: { status: string }) => `Exeat ${r.status.toLowerCase()}.`)
  @Post('exeats/:id/decide')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or decline a parent’s request (a reason is needed to decline)',
  })
  decide(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: DecideExeatDto,
  ) {
    return this.exeats.decide(auth, id, dto);
  }

  @ResponseMessage('Exeat cancelled.')
  @Post('exeats/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an exeat that hasn’t started' })
  cancel(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.exeats.cancel(auth, id);
  }

  @ResponseMessage('Signed out.')
  @Post('exeats/:id/sign-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign a boarder out at the gate to a parent or approved pickup person' })
  signOut(@CurrentUser() auth: AuthUserContext, @Param('id') id: string, @Body() dto: SignOutDto) {
    return this.exeats.signOut(auth, id, dto);
  }

  @ResponseMessage('Signed back in.')
  @Post('exeats/:id/sign-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign a boarder back in at the gate' })
  signIn(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.exeats.signIn(auth, id);
  }

  @ResponseMessage('Pickup list loaded.')
  @Get('students/:studentId/pickups')
  @ApiOperation({ summary: 'A boarder’s approved pickup people' })
  pickups(@CurrentUser() auth: AuthUserContext, @Param('studentId') studentId: string) {
    return this.exeats.staffPickups(auth, studentId);
  }

  @ResponseMessage('Added to the pickup list.')
  @Post('students/:studentId/pickups')
  @ApiOperation({ summary: 'Add someone to a boarder’s pickup list' })
  addPickup(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Body() dto: PickupDto,
  ) {
    return this.exeats.staffAddPickup(auth, studentId, dto);
  }

  @ResponseMessage('Removed from the pickup list.')
  @Delete('students/:studentId/pickups/:id')
  @ApiOperation({ summary: 'Remove someone from a boarder’s pickup list' })
  removePickup(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Param('id') id: string,
  ) {
    return this.exeats.staffRemovePickup(auth, studentId, id);
  }
}

/** School Admin › Boarding › Exeats and Gate (`/v1/boarding/...`). */
@ApiTags('school · boarding')
@Portals('SCHOOL_ADMIN')
@RequirePermission('boarding.view')
@Controller('boarding')
export class AdminExeatsController extends ExeatRoutes {
  constructor(
    exeats: ExeatsService,
    rollCalls: RollCallsService,
    sickBay: SickBayService,
    house: HouseLifeService,
  ) {
    super(exeats, rollCalls, sickBay, house);
  }
}

/** Staff workspace › Exeats and Gate (`/v1/staff-boarding/...`), for house staff and gate staff. */
@ApiTags('teacher · boarding')
@Portals('TEACHER')
@Controller('staff-boarding')
export class StaffExeatsController extends ExeatRoutes {
  constructor(
    exeats: ExeatsService,
    rollCalls: RollCallsService,
    sickBay: SickBayService,
    house: HouseLifeService,
  ) {
    super(exeats, rollCalls, sickBay, house);
  }
}

/** Parent Portal › Boarding (`/v1/parent/boarding/...`): pickup list and exeat requests. */
@ApiTags('parent · boarding')
@Portals('PARENT')
@Controller('parent/boarding')
export class ParentExeatsController {
  constructor(
    private readonly exeats: ExeatsService,
    private readonly sickBay: SickBayService,
    private readonly house: HouseLifeService,
  ) {}

  @ResponseMessage('Boarding loaded.')
  @Get(':studentId')
  @ApiOperation({ summary: 'A boarder’s pickup list, exeats and sick bay visits' })
  async view(@CurrentUser() auth: AuthUserContext, @Param('studentId') studentId: string) {
    const view = await this.exeats.parentView(auth, studentId);
    return {
      ...view,
      sickBay: await this.sickBay.forParent(studentId),
      ...(await this.house.forParent(studentId)),
    };
  }

  @ResponseMessage('Exeat requested.')
  @Post(':studentId/exeats')
  @ApiOperation({ summary: 'Ask for an exeat (the house master or mistress decides)' })
  request(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Body() dto: ExeatRequestDto,
  ) {
    return this.exeats.parentRequest(auth, studentId, dto);
  }

  @ResponseMessage('Exeat cancelled.')
  @Post('exeats/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an exeat you asked for (before they leave)' })
  cancel(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.exeats.parentCancel(auth, id);
  }

  @ResponseMessage('Added to the pickup list.')
  @Post(':studentId/pickups')
  @ApiOperation({ summary: 'Approve someone to collect your child' })
  addPickup(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Body() dto: PickupDto,
  ) {
    return this.exeats.parentAddPickup(auth, studentId, dto);
  }

  @ResponseMessage('Removed from the pickup list.')
  @Delete(':studentId/pickups/:id')
  @ApiOperation({ summary: 'Remove someone from your child’s pickup list' })
  removePickup(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') studentId: string,
    @Param('id') id: string,
  ) {
    return this.exeats.parentRemovePickup(auth, studentId, id);
  }
}
