import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { AssessmentSchedulesService } from './assessment-schedules.service.js';
import {
  LessonNoteDto,
  NewLessonNoteDto,
  NoteReturnDto,
  RescheduleAssessmentDto,
  ScheduleAssessmentDto,
} from './dto/lesson-notes.dto.js';
import { LessonNotesService } from './lesson-notes.service.js';
import { TeacherAnnouncementsService } from './teacher-announcements.service.js';

const noteId = new RecordIdPipe('That lesson note doesn’t exist.');
const assessmentId = new RecordIdPipe('That assessment doesn’t exist.');
const announcementId = new RecordIdPipe('That announcement doesn’t exist.');
const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id; the active term when omitted. Past and upcoming terms are read-only.',
});
const LOCKED = 'TERM_LOCKED: the term is closed or hasn’t started';

/** "Draft saved." / "Lesson note submitted…" / "Lesson note filed." for a saved note. */
const savedMessage = (n: { status: string; reviewer: string; noReview: boolean }) =>
  n.status === 'Draft'
    ? 'Draft saved.'
    : n.status === 'Returned'
      ? 'Changes saved. Submit the note to send it back for review.'
      : n.noReview
        ? 'Lesson note filed. Your own notes need no review.'
        : `Lesson note submitted to ${n.reviewer}.`;

/**
 * Teacher Workspace › Lesson notes (weekly notes for the subjects and class levels I lead),
 * Reviews › Lesson notes (HODs and the Academic Head), Assessments (when my classes take the
 * scheme's components) and Announcements (what the school sent to staff). Scoped to the
 * signed-in teacher; changes need the active term (409 TERM_LOCKED).
 */
@ApiTags('teacher workspace · lesson notes and assessments')
@Portals('TEACHER')
@Controller()
export class LessonNotesController {
  constructor(
    private readonly notes: LessonNotesService,
    private readonly assessments: AssessmentSchedulesService,
    private readonly announcements: TeacherAnnouncementsService,
  ) {}

  /* ---------------- My lesson notes ---------------- */

  @ResponseMessage('Lesson notes loaded.')
  @Get('lesson-notes')
  @termQuery
  @ApiOperation({
    summary: 'My lesson notes: the term’s weeks, my subjects × levels and every expected note',
    description:
      'One row per subject × class level I lead × week, up to next week (every week in a closed ' +
      'term), newest first. A note is due the Friday before its week; unsent after that, overdue.',
  })
  list(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.notes.list(auth, term);
  }

  @ResponseMessage(savedMessage)
  @Post('lesson-notes')
  @termQuery
  @ApiOperation({
    summary: 'Write a lesson note (a draft, or sent for review with `submit: true`)',
    description:
      'For a subject and class level I lead (co-teachers don’t write one). Goes to the ' +
      'department’s HOD, else the Academic Head; the Academic Head’s own notes are filed.',
  })
  @ApiConflictResponse({ description: `${LOCKED} · DUPLICATE: that week already has a note` })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with `fields`' })
  create(
    @CurrentUser() auth: AuthUserContext,
    @Body() dto: NewLessonNoteDto,
    @Query('term') term?: string,
  ) {
    return this.notes.create(auth, term, dto as Record<string, unknown>);
  }

  @ResponseMessage('Lesson note loaded.')
  @Get('lesson-notes/:noteId')
  @ApiOperation({ summary: 'One of my lesson notes, with its history' })
  @ApiForbiddenResponse({ description: 'Another teacher’s note' })
  get(@CurrentUser() auth: AuthUserContext, @Param('noteId', noteId) id: string) {
    return this.notes.get(auth, id);
  }

  @ResponseMessage(savedMessage)
  @Put('lesson-notes/:noteId')
  @ApiOperation({
    summary: 'Edit a Draft or Returned note (`submit: true` sends it; a returned note goes back)',
  })
  @ApiConflictResponse({ description: `${LOCKED} · NOTE_LOCKED: with the reviewer or approved` })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with `fields`' })
  update(
    @CurrentUser() auth: AuthUserContext,
    @Param('noteId', noteId) id: string,
    @Body() dto: LessonNoteDto,
  ) {
    return this.notes.update(auth, id, dto as Record<string, unknown>);
  }

  /* ---------------- Reviews › Lesson notes ---------------- */

  @ResponseMessage('Lesson notes loaded.')
  @Get('reviews/notes')
  @termQuery
  @ApiOperation({ summary: 'Lesson notes waiting on me, and those I decided this term' })
  @ApiForbiddenResponse({ description: 'Not an HOD or the Academic Head' })
  reviewList(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.notes.reviewList(auth, term);
  }

  @ResponseMessage('Lesson note loaded.')
  @Get('reviews/notes/:noteId')
  @ApiOperation({ summary: 'A note sent to me, read-only, with whether I can decide it now' })
  @ApiForbiddenResponse({ description: 'My own note, or not sent to me' })
  reviewNote(@CurrentUser() auth: AuthUserContext, @Param('noteId', noteId) id: string) {
    return this.notes.reviewNote(auth, id);
  }

  @ResponseMessage('Lesson note approved. The teacher was notified.')
  @Post('reviews/notes/:noteId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a note waiting on me (it becomes read-only)' })
  @ApiConflictResponse({ description: `${LOCKED} · ALREADY_DECIDED · NOT_SUBMITTED` })
  approve(@CurrentUser() auth: AuthUserContext, @Param('noteId', noteId) id: string) {
    return this.notes.approve(auth, id);
  }

  @ResponseMessage('Lesson note returned to the teacher.')
  @Post('reviews/notes/:noteId/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Return a note with a comment (10 characters or more)' })
  @ApiConflictResponse({ description: `${LOCKED} · ALREADY_DECIDED · NOT_SUBMITTED` })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION on `comment`' })
  returnNote(
    @CurrentUser() auth: AuthUserContext,
    @Param('noteId', noteId) id: string,
    @Body() dto: NoteReturnDto,
  ) {
    return this.notes.returnNote(auth, id, dto.comment);
  }

  /* ---------------- Assessments ---------------- */

  @ResponseMessage('Assessments loaded.')
  @Get('assessments')
  @termQuery
  @ApiQuery({ name: 'class', required: false, description: 'Class arm id' })
  @ApiQuery({ name: 'subject', required: false, description: 'Subject code' })
  @ApiOperation({ summary: 'The scheme per section I teach, and my classes’ scheduled components' })
  assessmentList(
    @CurrentUser() auth: AuthUserContext,
    @Query() q: { term?: string; class?: string; subject?: string },
  ) {
    return this.assessments.list(auth, q);
  }

  @ResponseMessage('Options loaded.')
  @Get('assessments/options')
  @termQuery
  @ApiOperation({ summary: 'What I can still schedule, per class and subject I teach' })
  assessmentOptions(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.assessments.options(auth, term);
  }

  @ResponseMessage('Assessment scheduled.')
  @Post('assessments')
  @termQuery
  @ApiOperation({
    summary: 'Schedule a scheme component for one of my classes',
    description: 'Once per class per term; a school day in the term, today or later.',
  })
  @ApiForbiddenResponse({ description: 'Not my class and subject this term' })
  @ApiConflictResponse({ description: `${LOCKED} · DUPLICATE: already scheduled` })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with `fields`' })
  schedule(
    @CurrentUser() auth: AuthUserContext,
    @Body() dto: ScheduleAssessmentDto,
    @Query('term') term?: string,
  ) {
    return this.assessments.create(auth, term, dto);
  }

  @ResponseMessage('Assessment loaded.')
  @Get('assessments/:assessmentId')
  @ApiOperation({ summary: 'One scheduled component, with scored / absent / exempt counts' })
  @ApiForbiddenResponse({ description: 'Not my class and subject' })
  assessment(
    @CurrentUser() auth: AuthUserContext,
    @Param('assessmentId', assessmentId) id: string,
  ) {
    return this.assessments.get(auth, id);
  }

  @ResponseMessage('Assessment updated.')
  @Patch('assessments/:assessmentId')
  @ApiOperation({
    summary: 'Reschedule, or change the topics and instructions',
    description: 'Not after the day has passed; the date can’t move once scores are on the sheet.',
  })
  @ApiConflictResponse({ description: `${LOCKED} · ALREADY_TAKEN · SCORES_ENTERED` })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with `fields`' })
  reschedule(
    @CurrentUser() auth: AuthUserContext,
    @Param('assessmentId', assessmentId) id: string,
    @Body() dto: RescheduleAssessmentDto,
  ) {
    return this.assessments.update(auth, id, dto);
  }

  /* ---------------- Announcements ---------------- */

  @ResponseMessage('Announcements loaded.')
  @Get('announcements')
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({
    summary: 'Announcements for staff: to everyone, teachers or all staff, on my campuses',
  })
  announcementList(@CurrentUser() auth: AuthUserContext, @Query('search') search?: string) {
    return this.announcements.list(auth, search);
  }

  @ResponseMessage('Announcement loaded.')
  @Get('announcements/:id')
  @ApiOperation({ summary: 'One announcement for staff' })
  announcement(@CurrentUser() auth: AuthUserContext, @Param('id', announcementId) id: string) {
    return this.announcements.get(auth, id);
  }
}
