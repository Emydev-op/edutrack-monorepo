import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
import { AssignmentsHomeworkService } from './assignments-homework.service.js';
import {
  AssignmentDto,
  BulkReturnDto,
  ExcuseDto,
  GradeDto,
  MaterialDto,
  UploadDto,
} from './dto/homework.dto.js';
import { HomeworkFilesService } from './homework-files.js';
import { MaterialsHomeworkService } from './materials-homework.service.js';

const assignmentId = new RecordIdPipe('That assignment doesn’t exist.');
const submissionId = new RecordIdPipe('That submission doesn’t exist.');
const materialId = new RecordIdPipe('That material doesn’t exist.');
const studentId = new RecordIdPipe('That student doesn’t exist.');
const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id; the active term when omitted. Past terms are read-only.',
});
const LOCKED = 'TERM_LOCKED: the term is closed or hasn’t started';
const FORBIDDEN = 'FORBIDDEN: not my class and subject this term (or someone else’s record)';

/** Uploads for homework: teachers (attachments, materials) and families (handed-in work). */
@ApiTags('homework')
@Controller()
export class UploadsController {
  constructor(private readonly files: HomeworkFilesService) {}

  @ResponseMessage('File uploaded.')
  @Post('uploads')
  @Portals('TEACHER', 'PARENT', 'STUDENT')
  @ApiOperation({
    summary: 'Upload one file for homework (attachment, material or handed-in work)',
    description:
      'PDF, Word, PowerPoint or an image (PNG, JPG, GIF, WebP), up to 25 MB, as a data URL; ' +
      'checked by its content. Answers the file’s `id` for the form that uses it. Only the ' +
      'uploader can attach it, once.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION on `file`' })
  upload(@CurrentUser() auth: AuthUserContext, @Body() dto: UploadDto) {
    return this.files.upload(auth, dto);
  }
}

/**
 * Teacher Workspace › Assignments and Materials. Scoped to the signed-in teacher: homework and
 * materials they post to the classes and subjects they teach this term (lead or co-teacher).
 * Changes need the active term (409 TERM_LOCKED); field problems answer 422 with `fields`.
 */
@ApiTags('teacher workspace · homework')
@Portals('TEACHER')
@Controller()
export class HomeworkController {
  constructor(
    private readonly assignments: AssignmentsHomeworkService,
    private readonly materials: MaterialsHomeworkService,
  ) {}

  /* ---------------- Assignments ---------------- */

  @ResponseMessage('Assignments loaded.')
  @Get('assignments')
  @termQuery
  @ApiQuery({ name: 'class', required: false, description: 'Class arm id' })
  @ApiQuery({ name: 'subject', required: false, description: 'Subject code' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Draft · Published · Closed · To grade',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOperation({ summary: 'My assignments for the term, with counts per status and to grade' })
  list(
    @CurrentUser() auth: AuthUserContext,
    @Query()
    q: {
      term?: string;
      class?: string;
      subject?: string;
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.assignments.list(auth, q);
  }

  @ResponseMessage('Assignments loaded.')
  @Get('assignments/student/:studentId')
  @termQuery
  @ApiOperation({ summary: 'One student’s assignments from me this term (the student page)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not a student I teach' })
  forStudent(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query('term') term?: string,
  ) {
    return this.assignments.forStudent(auth, id, term);
  }

  @ResponseMessage('Assignment loaded.')
  @Get('assignments/:assignmentId')
  @ApiOperation({ summary: 'One of my assignments: counts, attachments, permissions, history' })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  get(@CurrentUser() auth: AuthUserContext, @Param('assignmentId', assignmentId) id: string) {
    return this.assignments.get(auth, id);
  }

  @ResponseMessage((a: { status: string }) =>
    a.status === 'Draft'
      ? 'Draft saved.'
      : 'Assignment published. Students and their guardians were notified.',
  )
  @Post('assignments')
  @termQuery
  @ApiOperation({
    summary: 'Create an assignment (a draft, or published with `publish: true`)',
    description:
      'Publishing needs instructions, a due date inside the term and a max score (1–100), and ' +
      'notifies the class’s students and guardians (`assignment.published`, in-app by default). ' +
      'Attachments: up to 5 uploads (`POST /v1/uploads`) or my materials for the same class.',
  })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiConflictResponse({ description: LOCKED })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION with `fields`' })
  create(
    @CurrentUser() auth: AuthUserContext,
    @Body() dto: AssignmentDto,
    @Query('term') term?: string,
  ) {
    return this.assignments.create(auth, dto, term);
  }

  @ResponseMessage((a: { status: string }) =>
    a.status === 'Draft'
      ? 'Draft saved.'
      : 'Assignment saved. Students and guardians were notified.',
  )
  @Patch('assignments/:assignmentId')
  @ApiOperation({
    summary: 'Edit (or publish) an assignment',
    description:
      'A published assignment can’t move class or go back to draft; the max score can’t drop ' +
      'below a score already given. Closed assignments must be reopened first.',
  })
  @ApiConflictResponse({ description: LOCKED })
  update(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Body() dto: AssignmentDto,
  ) {
    return this.assignments.update(auth, id, dto);
  }

  @ResponseMessage('Submissions closed.')
  @Post('assignments/:assignmentId/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close submissions early (published only)' })
  close(@CurrentUser() auth: AuthUserContext, @Param('assignmentId', assignmentId) id: string) {
    return this.assignments.close(auth, id);
  }

  @ResponseMessage('Assignment reopened.')
  @Post('assignments/:assignmentId/reopen')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reopen a closed assignment (until the term ends)',
    description: 'Past the due date it accepts late work from then on.',
  })
  reopen(@CurrentUser() auth: AuthUserContext, @Param('assignmentId', assignmentId) id: string) {
    return this.assignments.reopen(auth, id);
  }

  @ResponseMessage('Draft deleted.')
  @Delete('assignments/:assignmentId')
  @ApiOperation({ summary: 'Delete a draft (published ones are closed instead)' })
  remove(@CurrentUser() auth: AuthUserContext, @Param('assignmentId', assignmentId) id: string) {
    return this.assignments.remove(auth, id);
  }

  /* ---------------- Submissions ---------------- */

  @ResponseMessage('Submissions loaded.')
  @Get('assignments/:assignmentId/submissions')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOperation({
    summary: 'The class list for an assignment, one row per student (missing ones included)',
  })
  submissions(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Query() q: { status?: string; search?: string; page?: string; pageSize?: string },
  ) {
    return this.assignments.submissions(auth, id, q);
  }

  @ResponseMessage((r: { returned: number; skipped: unknown[] }) =>
    r.skipped.length
      ? `${r.returned} returned, ${r.skipped.length} skipped.`
      : `${r.returned} returned. Students and guardians can see their scores and feedback.`,
  )
  @Post('assignments/:assignmentId/submissions/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Return graded submissions in bulk (others are skipped with a reason)' })
  returnBulk(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Body() dto: BulkReturnDto,
  ) {
    return this.assignments.returnBulk(auth, id, dto.ids);
  }

  @ResponseMessage('Submission loaded.')
  @Get('assignments/:assignmentId/submissions/:submissionId')
  @ApiOperation({ summary: 'One student’s work: files, note, score, feedback, history' })
  submission(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Param('submissionId', submissionId) sid: string,
  ) {
    return this.assignments.submission(auth, id, sid);
  }

  @ResponseMessage('Grade saved. It stays private until you return it.')
  @Put('assignments/:assignmentId/submissions/:submissionId/grade')
  @ApiOperation({ summary: 'Grade handed-in work (private until returned)' })
  grade(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Param('submissionId', submissionId) sid: string,
    @Body() dto: GradeDto,
  ) {
    return this.assignments.grade(auth, id, sid, dto);
  }

  @ResponseMessage('Returned. The student and guardians can see the score and feedback.')
  @Post('assignments/:assignmentId/submissions/:submissionId/return')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Return work to the student (with a score), notifying the family',
    description: 'Sends `assignment.returned` to the student and guardians (in-app by default).',
  })
  returnOne(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Param('submissionId', submissionId) sid: string,
    @Body() dto: GradeDto,
  ) {
    return this.assignments.returnOne(auth, id, sid, dto);
  }

  @ResponseMessage('Marked excused.')
  @Post('assignments/:assignmentId/submissions/:submissionId/excuse')
  @HttpCode(200)
  @ApiOperation({ summary: 'Excuse a student who hasn’t handed in (with a reason)' })
  excuse(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Param('submissionId', submissionId) sid: string,
    @Body() dto: ExcuseDto,
  ) {
    return this.assignments.excuse(auth, id, sid, dto.reason);
  }

  @ResponseMessage('Excuse removed.')
  @Delete('assignments/:assignmentId/submissions/:submissionId/excuse')
  @ApiOperation({ summary: 'Undo an excuse (back to Not submitted)' })
  unexcuse(
    @CurrentUser() auth: AuthUserContext,
    @Param('assignmentId', assignmentId) id: string,
    @Param('submissionId', submissionId) sid: string,
  ) {
    return this.assignments.unexcuse(auth, id, sid);
  }

  /* ---------------- Materials ---------------- */

  @ResponseMessage('Materials loaded.')
  @Get('materials')
  @termQuery
  @ApiQuery({ name: 'class', required: false })
  @ApiQuery({ name: 'subject', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'My materials for the term' })
  materialList(
    @CurrentUser() auth: AuthUserContext,
    @Query()
    q: {
      term?: string;
      class?: string;
      subject?: string;
      type?: string;
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.materials.list(auth, q);
  }

  @ResponseMessage('Material loaded.')
  @Get('materials/:materialId')
  @ApiOperation({ summary: 'One of my materials, with a download link (an hour)' })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  material(@CurrentUser() auth: AuthUserContext, @Param('materialId', materialId) id: string) {
    return this.materials.get(auth, id);
  }

  @ResponseMessage((m: { classLabel: string }) => `Published to ${m.classLabel}.`)
  @Post('materials')
  @termQuery
  @ApiOperation({
    summary: 'Share a material: an uploaded file (`file.id`) or a YouTube, Vimeo or Drive link',
  })
  @ApiConflictResponse({ description: LOCKED })
  createMaterial(
    @CurrentUser() auth: AuthUserContext,
    @Body() dto: MaterialDto,
    @Query('term') term?: string,
  ) {
    return this.materials.create(auth, dto, term);
  }

  @ResponseMessage('Material archived. Students no longer see it.')
  @Post('materials/:materialId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive (assignments that attach it show it as unavailable)' })
  archive(@CurrentUser() auth: AuthUserContext, @Param('materialId', materialId) id: string) {
    return this.materials.archive(auth, id);
  }

  @ResponseMessage('Material restored. Students can see it again.')
  @Post('materials/:materialId/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore an archived material' })
  restore(@CurrentUser() auth: AuthUserContext, @Param('materialId', materialId) id: string) {
    return this.materials.restore(auth, id);
  }
}
