import { SchoolWide, ScopedBy } from '../../common/plan/branch-scope.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentTenant } from '../../common/decorators/request.decorators.js';
import {
  RawResponse,
  ResponseMessage,
  type MessageRequest,
} from '../../common/http/api-response.js';
import { StaffImportDto } from '../staff/dto/staff.dto.js';
import { ClassImportService } from './class-import.service.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { plural } from './academic-format.js';
import { CalendarService } from './calendar.service.js';
import { ClassesService, type ClassesView } from './classes.service.js';
import { BranchTermDatesDto, CalendarEventDto } from './dto/calendar.dto.js';
import {
  ArmInputDto,
  LevelInputDto,
  MoveLevelDto,
  NewSessionDto,
  RenameLevelDto,
  SaveSectionsDto,
  SaveTermsDto,
  UpdateArmDto,
} from './dto/academics.dto.js';
import {
  AcademicSessionResponse,
  ClassArmResponse,
  ClassDetailResponse,
  ClassesViewResponse,
  SectionsViewResponse,
  SessionsViewResponse,
} from './dto/academics.responses.js';
import { SectionsService } from './sections.service.js';
import { SessionsService, type SessionView } from './sessions.service.js';

const sessionId = new RecordIdPipe('Session not found');
const termId = new RecordIdPipe('Term not found');
const eventId = new RecordIdPipe(
  'Only school events can be edited here. Term events are edited in Sessions & Terms.',
);

/**
 * Academics › Sections, Sessions & Terms, Classes & Arms (Phase 1). Calendar, subjects,
 * timetable, assessments, results, promotion and attendance come in later phases.
 */
@ApiTags('school · academics')
@Portals('SCHOOL_ADMIN')
@Controller('academics')
export class AcademicsController {
  constructor(
    private readonly sections: SectionsService,
    private readonly sessions: SessionsService,
    private readonly classes: ClassesService,
    private readonly calendarService: CalendarService,
    private readonly classImport: ClassImportService,
  ) {}

  /* ---------------- Sections ---------------- */

  @ResponseMessage('Academic sections loaded.')
  @Get('sections')
  @RequirePermission('academics.view')
  @ApiOperation({ summary: 'The sections the school runs, in promotion order' })
  @ApiOkResponse({ type: SectionsViewResponse })
  sectionsView() {
    return this.sections.view();
  }

  @ResponseMessage('Academic sections saved.')
  @SchoolWide()
  @Put('sections')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Save every section',
    description:
      'Replaces the list (order = promotion path). Renames keep classes and branches; removed ' +
      'sections leave their branches. A section with class levels can’t be removed.',
  })
  @ApiOkResponse({ type: SectionsViewResponse })
  @ApiUnprocessableEntityResponse({
    description:
      'SECTIONS_REQUIRED · SECTION_NAME_TAKEN · SECTION_CODE_TAKEN · SECTION_HAS_CLASSES',
  })
  saveSections(@CurrentTenant() schoolId: string, @Body() dto: SaveSectionsDto) {
    return this.sections.save(schoolId, dto.sections);
  }

  /* ---------------- Sessions & terms ---------------- */

  @ResponseMessage('Sessions loaded.')
  @Get('sessions')
  @RequirePermission('academics.view')
  @ApiOperation({
    summary: 'Sessions (newest first), the current one, the active term’s checklist',
  })
  @ApiOkResponse({ type: SessionsViewResponse })
  sessionsView() {
    return this.sessions.view();
  }

  @ResponseMessage((s: SessionView) => `${s.name} created. Next: set term dates and breaks.`)
  @SchoolWide()
  @Post('sessions')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Create a session with evenly spread terms',
    description:
      'A school’s first session starts Active with its first term; later ones are Upcoming until ' +
      'started. `copy: ["calendar"]` copies the current session’s term events, shifted.',
  })
  @ApiCreatedResponse({ type: AcademicSessionResponse })
  @ApiUnprocessableEntityResponse({
    description: 'SESSION_NAME_TAKEN · SESSION_OVERLAP · SESSION_LENGTH · VALIDATION',
  })
  createSession(@CurrentTenant() schoolId: string, @Body() dto: NewSessionDto) {
    return this.sessions.create(schoolId, dto);
  }

  @ResponseMessage((s: SessionView) => `Terms and calendar saved for ${s.name}.`)
  @SchoolWide()
  @Put('sessions/:id/terms')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Save the session’s terms and their events' })
  @ApiOkResponse({ type: AcademicSessionResponse })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SESSION_CLOSED · TERM_HAS_RECORDS' })
  @ApiUnprocessableEntityResponse({ description: 'TERM_DATES · TERM_OVERLAP · VALIDATION' })
  saveTerms(
    @CurrentTenant() schoolId: string,
    @Param('id', sessionId) id: string,
    @Body() dto: SaveTermsDto,
  ) {
    return this.sessions.saveTerms(schoolId, id, dto.terms);
  }

  @ResponseMessage((s: SessionView) => `${s.name} is now active.`)
  @SchoolWide()
  @Post('sessions/:id/start')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Start an upcoming session',
    description: 'The active session (every term closed) moves to Closing.',
  })
  @ApiOkResponse({ type: AcademicSessionResponse })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SESSION_NOT_UPCOMING · SESSION_TERMS_OPEN' })
  startSession(@Param('id', sessionId) id: string) {
    return this.sessions.start(id);
  }

  @ResponseMessage((r: { next: string | null }) =>
    r.next ? `Term closed. ${r.next} is now the active term.` : 'Term closed.',
  )
  @SchoolWide()
  @Post('terms/:id/close')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Close the active term',
    description:
      'After its end date, once its results are entered, approved and published. Its registers, ' +
      'scores, assignments and timetables become read-only; the next term becomes active.',
  })
  @ApiConflictResponse({ description: 'TERM_NOT_ACTIVE · TERM_NOT_READY' })
  closeTerm(@Param('id', termId) id: string) {
    return this.sessions.closeTerm(id);
  }

  @ResponseMessage('Closing checklist loaded.')
  @Get('sessions/:id/close')
  @RequirePermission('academics.view')
  @ApiOperation({ summary: 'What still stands between a session and closing' })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  sessionChecklist(@Param('id', sessionId) id: string) {
    return this.sessions.sessionChecklist(id);
  }

  @ResponseMessage(
    (r: { session: SessionView }) => `${r.session.name} closed. It is now read-only.`,
  )
  @SchoolWide()
  @Post('sessions/:id/close')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Close a session (Closing, every term closed, results done)',
    description: 'The session becomes read-only and its remaining enrollments are completed.',
  })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SESSION_NOT_READY' })
  closeSession(@Param('id', sessionId) id: string) {
    return this.sessions.closeSession(id);
  }

  /* ---------------- Academic calendar ---------------- */

  @ResponseMessage('Calendar loaded.')
  @Get('calendar')
  @RequirePermission('academics.view')
  @ApiOperation({
    summary:
      'The current session’s calendar: term dates and events, public holidays, school events',
  })
  calendar() {
    return this.calendarService.view();
  }

  @ResponseMessage((e: { title: string }) => `${e.title} added to the calendar.`)
  @Post('calendar/events')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Add a school event (Holiday and Break days have no classes)' })
  @ApiConflictResponse({ description: 'NO_SESSION' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  addEvent(@CurrentTenant() schoolId: string, @Body() dto: CalendarEventDto) {
    return this.calendarService.create(schoolId, dto);
  }

  @ResponseMessage((e: { title: string }) => `${e.title} updated.`)
  @Put('calendar/events/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Change a school event (term events are edited in Sessions & Terms)' })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND' })
  updateEvent(@Param('id', eventId) id: string, @Body() dto: CalendarEventDto) {
    return this.calendarService.update(id, dto);
  }

  @ResponseMessage((r: { title: string }) => `${r.title} removed from the calendar.`)
  @Delete('calendar/events/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Remove a school event' })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND' })
  removeEvent(@Param('id', eventId) id: string) {
    return this.calendarService.remove(id);
  }

  @ResponseMessage(
    (r: { saved: { branch: string; term: string } }) =>
      `${r.saved.branch} · ${r.saved.term} dates saved.`,
  )
  @Put('calendar/branch-terms')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'A campus’s own start and end for a term (both null: back to the term’s dates)',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  setBranchTermDates(@Body() dto: BranchTermDatesDto) {
    return this.calendarService.setBranchTermDates(dto);
  }

  /* ---------------- Classes & arms ---------------- */

  @RawResponse()
  @Get('classes/import/template')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary:
      'The classes and arms template (.xlsx): one row per arm, with branch and section lists',
  })
  async classTemplate() {
    return new StreamableFile(await this.classImport.template(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="edutrack-classes-template.xlsx"',
    });
  }

  @ResponseMessage('File checked.')
  @SchoolWide()
  @Post('classes/import')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Check a file of classes and arms',
    description:
      'Columns: branch, section, class_level, arm (required), capacity, room, class_teacher ' +
      '(email or staff number). Every row comes back with its errors and warnings; nothing is ' +
      'saved until the import is committed.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'IMPORT_FORMAT, IMPORT_EMPTY, IMPORT_COLUMNS, IMPORT_TOO_LONG',
  })
  previewClasses(@Body() dto: StaffImportDto) {
    return this.classImport.preview(dto);
  }

  @ResponseMessage((r: { imported: number; skipped: number }) =>
    r.skipped
      ? `${plural(r.imported, 'arm')} imported. ${plural(r.skipped, 'row')} skipped.`
      : `${plural(r.imported, 'arm')} imported.`,
  )
  @SchoolWide()
  @Post('classes/import/:id/commit')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Import the valid rows (new class levels are added at their branch)',
  })
  @ApiNotFoundResponse({ description: 'IMPORT_EXPIRED: upload the file again.' })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_NOTHING_VALID' })
  commitClasses(@Param('id') id: string) {
    return this.classImport.commit(id);
  }

  @ResponseMessage('Classes loaded.')
  @Get('classes')
  @RequirePermission('academics.view')
  @ApiOperation({ summary: 'Class levels per active branch with their arms' })
  @ApiOkResponse({ type: ClassesViewResponse })
  classesView() {
    return this.classes.view();
  }

  @ResponseMessage(
    (v: ClassesView) =>
      `${plural(v.levels.length, 'class level')} added with one arm each. Rename, add or remove anything.`,
  )
  @SchoolWide()
  @Post('classes/defaults')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Add the standard Nigerian levels for every section, with arm A' })
  @ApiOkResponse({ type: ClassesViewResponse })
  @ApiConflictResponse({ description: 'SECTIONS_NOT_CONFIRMED' })
  @ApiUnprocessableEntityResponse({ description: 'NO_DEFAULT_LEVELS' })
  applyDefaults(@CurrentTenant() schoolId: string) {
    return this.classes.applyDefaults(schoolId);
  }

  @ResponseMessage((_: ClassesView, req: MessageRequest<LevelInputDto>) => {
    const arms = req.body.arms.filter((a) => a.trim()).length;
    return `${req.body.name.trim()} added with ${arms} arm${arms === 1 ? '' : 's'}.`;
  })
  @SchoolWide()
  @Post('classes/levels')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Add a class level at a branch with its arms' })
  @ApiCreatedResponse({ type: ClassesViewResponse })
  @ApiUnprocessableEntityResponse({
    description: 'BRANCH_NOT_ACTIVE · SECTION_NOT_AT_BRANCH · LEVEL_NAME_TAKEN · VALIDATION',
  })
  addLevel(@CurrentTenant() schoolId: string, @Body() dto: LevelInputDto) {
    return this.classes.addLevel(schoolId, dto);
  }

  @ResponseMessage(
    (_: ClassesView, req: MessageRequest<RenameLevelDto>) =>
      `Renamed to ${req.body.name.trim()}. Students and curriculum moved with it.`,
  )
  @SchoolWide()
  @Put('classes/levels/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Rename a class level',
    description: 'Levels are shared by name across branches, so every branch sees the new name.',
  })
  @ApiOkResponse({ type: ClassesViewResponse })
  @ApiNotFoundResponse({ description: 'LEVEL_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'LEVEL_NAME_TAKEN' })
  renameLevel(@Param('id') id: string, @Body() dto: RenameLevelDto) {
    return this.classes.renameLevel(id, dto.name);
  }

  @ResponseMessage('Class level moved.')
  @SchoolWide()
  @Post('classes/levels/:id/move')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Move a level up or down its section (the promotion order)' })
  @ApiOkResponse({ type: ClassesViewResponse })
  @ApiNotFoundResponse({ description: 'LEVEL_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'LEVEL_AT_END' })
  moveLevel(@Param('id') id: string, @Body() dto: MoveLevelDto) {
    return this.classes.moveLevel(id, dto.direction);
  }

  @ResponseMessage((v: { removed: string }) => `${v.removed} removed.`)
  @SchoolWide()
  @Delete('classes/levels/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Remove a class level from its branch, with its arms' })
  @ApiOkResponse({ type: ClassesViewResponse })
  @ApiNotFoundResponse({ description: 'LEVEL_NOT_FOUND' })
  @ApiConflictResponse({ description: 'LEVEL_HAS_STUDENTS' })
  deleteLevel(@Param('id') id: string) {
    return this.classes.deleteLevel(id);
  }

  @ResponseMessage((v: { added: string }) => `Arm ${v.added} added.`)
  @Post('classes/levels/:id/arms')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Add an arm to a level (the next free letter when unnamed)' })
  @ApiCreatedResponse({ type: ClassesViewResponse })
  @ApiNotFoundResponse({ description: 'LEVEL_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'ARM_NAME_TAKEN · TEACHER_NOT_FOUND · TEACHER_OTHER_BRANCH · VALIDATION',
  })
  @ScopedBy('level')
  addArm(@CurrentTenant() schoolId: string, @Param('id') id: string, @Body() dto: ArmInputDto) {
    return this.classes.addArm(schoolId, id, dto);
  }

  @ResponseMessage('Arm saved.')
  @Put('classes/arms/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Rename an arm, change its places, room or class teacher' })
  @ApiOkResponse({ type: ClassArmResponse })
  @ApiNotFoundResponse({ description: 'CLASS_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'ARM_NAME_TAKEN · CAPACITY_BELOW_STUDENTS · TEACHER_NOT_FOUND · NO_SESSION',
  })
  @ScopedBy('arm')
  updateArm(@CurrentTenant() schoolId: string, @Param('id') id: string, @Body() dto: UpdateArmDto) {
    return this.classes.updateArm(schoolId, id, dto);
  }

  @ResponseMessage((v: { removed: string }) => `${v.removed} removed.`)
  @Delete('classes/arms/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Remove an arm without students (not a level’s only arm)' })
  @ApiOkResponse({ type: ClassesViewResponse })
  @ApiNotFoundResponse({ description: 'CLASS_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ARM_HAS_STUDENTS · ONLY_ARM' })
  @ScopedBy('arm')
  deleteArm(@Param('id') id: string) {
    return this.classes.deleteArm(id);
  }

  @ResponseMessage('Class loaded.')
  @Get('classes/:id')
  @RequirePermission('academics.view')
  @ApiOperation({
    summary: 'One arm with its students',
    description: 'Subjects, timetable and results are filled by their phases (empty for now).',
  })
  @ApiOkResponse({ type: ClassDetailResponse })
  @ApiNotFoundResponse({ description: 'CLASS_NOT_FOUND' })
  @ScopedBy('arm')
  classDetail(@Param('id') id: string) {
    return this.classes.detail(id);
  }
}
