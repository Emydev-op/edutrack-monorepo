import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
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
import { ResponseMessage, type MessageRequest } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { plural } from './academic-format.js';
import { ClassesService, type ClassesView } from './classes.service.js';
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

  /* ---------------- Classes & arms ---------------- */

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
  classDetail(@Param('id') id: string) {
    return this.classes.detail(id);
  }
}
