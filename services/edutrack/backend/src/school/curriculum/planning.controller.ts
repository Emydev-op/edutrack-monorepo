import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
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
import { SubjectImportCommitDto, SubjectImportFileDto } from './dto/subject-import.dto.js';
import { SubjectImportService } from './subject-import.service.js';
import { plural } from '../academics/academic-format.js';
import { AssessmentService, type AssessmentInput } from '../assessment/assessment.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { CurriculumService } from './curriculum.service.js';
import {
  AssignmentInputDto,
  SaveAssessmentDto,
  SaveCurriculumDto,
  SubjectInputDto,
  TimetableCopyDto,
  TimetableGridDto,
  TimetableRefDto,
} from './dto/academics-3a.dto.js';

const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id (the header’s working term); the current term when omitted',
});
const branchQuery = ApiQuery({
  name: 'branch',
  required: false,
  description: 'Branch name (the header’s working branch); every branch when omitted',
});

/**
 * Academics, Phase 3a: Subjects & Curriculum, Teacher Assignments, Timetable, Assessment &
 * Grading, and the read-only Attendance view. Results, report cards and promotion come in 3b.
 */
@ApiTags('school · academics')
@Portals('SCHOOL_ADMIN')
@Controller('academics')
export class PlanningController {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly subjectImport: SubjectImportService,
    private readonly assignments: AssignmentsService,
    private readonly timetable: TimetableService,
    private readonly assessment: AssessmentService,
    private readonly attendance: AttendanceService,
  ) {}

  /* ---------------- Subjects & curriculum ---------------- */

  @ResponseMessage('Curriculum loaded.')
  @Get('curriculum')
  @RequirePermission('academics.view')
  @ApiOperation({
    summary: 'Subjects, what each class level offers this session, and elective groups',
  })
  curriculumView() {
    return this.curriculum.view();
  }

  @ResponseMessage(
    (v: { subjects: unknown[] }) =>
      `${plural(v.subjects.length, 'subject')} added with the Nigerian curriculum. Change anything you need.`,
  )
  @Post('subjects/defaults')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Add the suggested Nigerian subjects for the sections you run',
    description: 'Also offers them at your class levels and adds the usual elective groups.',
  })
  @ApiConflictResponse({ description: 'NO_SESSION · SUBJECTS_EXIST · NO_LEVELS' })
  applyDefaults(@CurrentTenant() schoolId: string) {
    return this.curriculum.applyDefaults(schoolId);
  }

  /* ---------------- Subject bulk upload ---------------- */

  @RawResponse()
  @Get('subjects/template')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'The bulk-upload template (.xlsx, with dropdowns for section, category and status)',
  })
  async subjectTemplate() {
    return new StreamableFile(await this.subjectImport.template(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="edutrack-subjects-template.xlsx"',
    });
  }

  @ResponseMessage((r: { total: number; withIssues: number }) =>
    r.withIssues
      ? `${plural(r.total, 'subject')} read. ${plural(r.withIssues, 'row')} need fixing.`
      : `${plural(r.total, 'subject')} ready to import.`,
  )
  @Post('subjects/import')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Read an uploaded template and check every row (nothing is saved)',
    description:
      'Duplicates are caught inside the file and against existing subjects (codes unique in the ' +
      'school, names unique per section). Blank codes get a suggestion.',
  })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_INVALID' })
  previewSubjects(@Body() dto: SubjectImportFileDto) {
    return this.subjectImport.preview(dto.fileName, dto.content);
  }

  @ResponseMessage((r: { imported: number }) => `${plural(r.imported, 'subject')} imported.`)
  @Post('subjects/import/commit')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Import the checked (and corrected) rows: all of them, or none',
    description: '422 IMPORT_HAS_ISSUES lists problems as fields "<row>.<field>".',
  })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_HAS_ISSUES · IMPORT_INVALID' })
  importSubjects(@CurrentTenant() schoolId: string, @Body() dto: SubjectImportCommitDto) {
    return this.subjectImport.commit(schoolId, dto.rows);
  }

  @ResponseMessage(
    (_: unknown, req: MessageRequest<SubjectInputDto>) => `${req.body.name.trim()} added.`,
  )
  @Post('subjects')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Add a subject' })
  @ApiUnprocessableEntityResponse({
    description: 'SUBJECT_CODE_TAKEN · SUBJECT_NAME_TAKEN · VALIDATION',
  })
  createSubject(@CurrentTenant() schoolId: string, @Body() dto: SubjectInputDto) {
    return this.curriculum.createSubject(schoolId, dto);
  }

  @ResponseMessage(
    (_: unknown, req: MessageRequest<SubjectInputDto>) => `${req.body.name.trim()} saved.`,
  )
  @Put('subjects/:code')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Edit a subject (the code stays)' })
  @ApiNotFoundResponse({ description: 'SUBJECT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SUBJECT_ASSIGNED' })
  updateSubject(@Param('code') code: string, @Body() dto: SubjectInputDto) {
    return this.curriculum.updateSubject(code, dto);
  }

  @ResponseMessage('Subject removed.')
  @Delete('subjects/:code')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Delete a subject nobody has used',
    description:
      'Anything with history (results, assignments, earlier sessions) is refused: make it inactive.',
  })
  @ApiNotFoundResponse({ description: 'SUBJECT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SUBJECT_HAS_RESULTS · SUBJECT_ASSIGNED · SUBJECT_IN_USE' })
  removeSubject(@Param('code') code: string) {
    return this.curriculum.removeSubject(code);
  }

  @ResponseMessage((v: { cleared: number }) =>
    v.cleared
      ? `Curriculum saved. ${plural(v.cleared, 'teacher assignment')} cleared for subjects no longer offered.`
      : 'Curriculum saved.',
  )
  @Put('curriculum')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Save the session’s curriculum and elective groups',
    description:
      'Taking a subject out of a class clears its teacher assignments and draft lessons for this ' +
      'and later terms; refused once it has results this session.',
  })
  @ApiConflictResponse({ description: 'NO_SESSION · CURRICULUM_HAS_SCORES · CURRICULUM_TAUGHT' })
  saveCurriculum(@CurrentTenant() schoolId: string, @Body() dto: SaveCurriculumDto) {
    return this.curriculum.save(schoolId, dto);
  }

  /* ---------------- Teacher assignments ---------------- */

  @ResponseMessage('Teacher assignments loaded.')
  @Get('assignments')
  @RequirePermission('academics.view')
  @termQuery
  @branchQuery
  @ApiOperation({ summary: 'Assignments, teachers’ loads, gaps and arms without a class teacher' })
  assignmentsView(@Query('term') term?: string, @Query('branch') branch?: string) {
    return this.assignments.view(term, branch);
  }

  @ResponseMessage('Checked.')
  @Post('assignments/check')
  @HttpCode(200)
  @RequirePermission('academics.view')
  @termQuery
  @ApiOperation({
    summary: 'Warnings for an assignment before saving it',
    description:
      'Branch, curriculum, replacement, workload, qualification and timetable conflicts. ' +
      '`error` ones (except timetable conflicts) block saving.',
  })
  checkAssignment(@Body() dto: AssignmentInputDto, @Query('term') term?: string) {
    return this.assignments.check(dto, term);
  }

  @ResponseMessage('Assignment saved.')
  @Post('assignments')
  @RequirePermission('academics.configure')
  @termQuery
  @ApiOperation({
    summary: 'Assign (or reassign) a subject in an arm for the term',
    description: 'Replaces the arm’s current teacher for that subject; placed lessons follow.',
  })
  @ApiUnprocessableEntityResponse({ description: 'ASSIGNMENT_INVALID · VALIDATION' })
  assign(
    @CurrentTenant() schoolId: string,
    @Body() dto: AssignmentInputDto,
    @Query('term') term?: string,
  ) {
    return this.assignments.assign(schoolId, dto, term);
  }

  @ResponseMessage(
    (v: { copied: number }) => `${plural(v.copied, 'assignment')} copied from the previous term.`,
  )
  @Post('assignments/copy-previous')
  @HttpCode(200)
  @RequirePermission('academics.configure')
  @termQuery
  @ApiOperation({ summary: 'Copy the previous term’s assignments into empty slots' })
  copyPrevious(@CurrentTenant() schoolId: string, @Query('term') term?: string) {
    return this.assignments.copyPrevious(schoolId, term);
  }

  @ResponseMessage('Assignment removed.')
  @Delete('assignments/:id')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Remove an assignment' })
  @ApiNotFoundResponse({ description: 'ASSIGNMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ASSIGNMENT_HAS_SCORES' })
  removeAssignment(@Param('id') id: string) {
    return this.assignments.remove(id);
  }

  /* ---------------- Timetable ---------------- */

  @ResponseMessage('Classes loaded.')
  @Get('timetable/arms')
  @RequirePermission('academics.view')
  @termQuery
  @branchQuery
  @ApiOperation({ summary: 'Every arm with its timetable status for the term' })
  timetableArms(@Query('term') term?: string, @Query('branch') branch?: string) {
    return this.timetable.arms(term, branch);
  }

  @ResponseMessage('Timetable loaded.')
  @Get('timetable')
  @RequirePermission('academics.view')
  @termQuery
  @ApiQuery({ name: 'arm', required: true, description: 'Class arm id' })
  @ApiOperation({
    summary: 'An arm’s timetable: periods, the draft grid, what to place, teachers’ other lessons',
  })
  @ApiNotFoundResponse({ description: 'ARM_NOT_FOUND' })
  timetableView(@Query('arm') arm: string, @Query('term') term?: string) {
    return this.timetable.view(arm, term);
  }

  @ResponseMessage('Draft saved.')
  @Put('timetable')
  @RequirePermission('academics.timetable')
  @ApiOperation({
    summary: 'Save the draft grid',
    description:
      'Refused when a teacher would be in two classes at once (409), a lesson is in a break, a ' +
      'subject has more lessons than it needs or runs too many periods in a row.',
  })
  @ApiConflictResponse({ description: 'TIMETABLE_LOCKED · TIMETABLE_CLASH' })
  @ApiUnprocessableEntityResponse({
    description: 'TIMETABLE_SLOT · TIMETABLE_SUBJECT · TIMETABLE_COUNT · TIMETABLE_CONSECUTIVE',
  })
  saveTimetable(@Body() dto: TimetableGridDto) {
    return this.timetable.save(dto);
  }

  @ResponseMessage('Empty periods filled. Check the draft, then mark it reviewed.')
  @Post('timetable/suggest')
  @HttpCode(200)
  @RequirePermission('academics.timetable')
  @ApiOperation({ summary: 'Fill the draft’s empty periods without clashing teachers' })
  suggest(@Body() dto: TimetableGridDto) {
    return this.timetable.suggest(dto);
  }

  @ResponseMessage('Draft copied.')
  @Post('timetable/copy')
  @HttpCode(200)
  @RequirePermission('academics.timetable')
  @ApiOperation({ summary: 'Start the draft from another term’s timetable for the same arm' })
  copyTimetable(@Body() dto: TimetableCopyDto) {
    return this.timetable.copy(dto);
  }

  @ResponseMessage(
    (v: { status: string; version: number }, req: MessageRequest<unknown>) =>
      ({
        review: 'Marked as reviewed. Publish it when you’re ready.',
        publish: `Version ${v.version} published. Teachers and students see it now.`,
        revise: `Revision v${v.version} started. The published version stays until you publish this one.`,
      })[req.params.action ?? ''] ?? 'Saved.',
  )
  @Post('timetable/:action')
  @HttpCode(200)
  @RequirePermission('academics.timetable')
  @ApiOperation({ summary: 'review · publish · revise' })
  @ApiConflictResponse({ description: 'TIMETABLE_STATUS · TIMETABLE_CLASH' })
  @ApiUnprocessableEntityResponse({ description: 'TIMETABLE_INCOMPLETE · TIMETABLE_NO_TEACHER' })
  timetableAction(@Param('action') action: string, @Body() dto: TimetableRefDto) {
    return this.timetable.act(action, dto);
  }

  /* ---------------- Assessment & grading ---------------- */

  @ResponseMessage('Assessment & grading loaded.')
  @Get('assessment')
  @RequirePermission('academics.view')
  @ApiOperation({ summary: 'Each section’s scheme for the session, pass mark and rounding' })
  assessmentView() {
    return this.assessment.view();
  }

  @ResponseMessage('Assessment & grading saved.')
  @Put('assessment')
  @RequirePermission('academics.configure')
  @ApiOperation({
    summary: 'Save every section’s scheme',
    description:
      'Weights must total 100 and grade bands cover 0–100 without gaps. Components and weights ' +
      'are fixed once a section has published results.',
  })
  @ApiConflictResponse({
    description: 'NO_SESSION · SCHEME_LOCKED · COMPONENT_IN_USE · RATING_IN_USE',
  })
  @ApiUnprocessableEntityResponse({ description: 'SCHEME_INVALID · VALIDATION' })
  saveAssessment(@CurrentTenant() schoolId: string, @Body() dto: SaveAssessmentDto) {
    return this.assessment.save(schoolId, dto as unknown as AssessmentInput);
  }

  /* ---------------- Attendance ---------------- */

  @ResponseMessage('Attendance loaded.')
  @Get('attendance')
  @RequirePermission('academics.view')
  @termQuery
  @branchQuery
  @ApiOperation({ summary: 'Every arm’s attendance this term, days not taken and closures' })
  attendanceOverview(@Query('term') term?: string, @Query('branch') branch?: string) {
    return this.attendance.overview(term, branch);
  }

  @ResponseMessage('Attendance loaded.')
  @Get('attendance/:armId')
  @RequirePermission('academics.view')
  @termQuery
  @ApiOperation({ summary: 'One arm’s registers by day and every student’s attendance' })
  @ApiNotFoundResponse({ description: 'ARM_NOT_FOUND' })
  attendanceArm(@Param('armId') armId: string, @Query('term') term?: string) {
    return this.attendance.armDetail(armId, term);
  }
}
