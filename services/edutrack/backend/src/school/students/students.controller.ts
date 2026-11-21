import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { noticeOf } from '../staff/staff-audit.js';
import {
  AssignArmDto,
  EnrollDto,
  EnrollmentOptionsQueryDto,
  StudentPhotoDto,
  StudentQueryDto,
  TransferStudentDto,
} from './dto/students.dto.js';
import { StudentPhotoService } from './student-photo.service.js';
import {
  EnrolledDto,
  EnrollmentOptionsDto,
  MovedDto,
  StudentDetailDto,
  StudentRowDto,
} from './dto/students.responses.js';
import { StudentMovesService } from './student-moves.service.js';
import { STUDENT_NOT_FOUND, StudentsService } from './students.service.js';

const studentId = new RecordIdPipe(STUDENT_NOT_FOUND);
const NOT_FOUND = 'STUDENT_NOT_FOUND: this student doesn’t exist (or belongs to another school).';

/**
 * School Admin › Students: the list, the student page, transfers and withdrawals, and moving
 * students between arms. Contract: `school-admin/src/api/mock/handlers/students.ts`.
 */
@ApiTags('school · students')
@ApiExtraModels(StudentRowDto)
@Portals('SCHOOL_ADMIN')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly moves: StudentMovesService,
    private readonly photos: StudentPhotoService,
  ) {}

  @ResponseMessage('Students loaded.')
  @Get()
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'The students list',
    description:
      'Every student (on the roll and leavers) by surname, with the class this session, primary ' +
      'guardian and balance. Filters: status, className (prefix: "JSS 2" or "JSS 2B"), gender; ' +
      'search matches name, admission number and guardian.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: getSchemaPath(StudentRowDto) } },
        meta: { type: 'object' },
      },
    },
  })
  list(@Query() query: StudentQueryDto) {
    return this.students.list(query);
  }

  // Static routes before `/:id`.
  @ResponseMessage((r: unknown) => noticeOf(r, 'Students moved.'))
  @Post('assign-arm')
  @HttpCode(200)
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Move students to another arm',
    description:
      'Moves students of one class level (at one branch) to another arm of it for this session. ' +
      'The previous arm stays on each student’s timeline.',
  })
  @ApiOkResponse({ type: MovedDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'ARM_FULL, NOT_ENROLLED, STUDENT_LEFT, NO_SESSION' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION (one class level, unknown arm)' })
  assignArm(@Body() dto: AssignArmDto) {
    return this.moves.assignArm(dto);
  }

  @ResponseMessage('Student loaded.')
  @Get(':id')
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'A student’s record',
    description:
      'Details, class history, guardians, documents and timeline. Medical notes are null unless ' +
      'the member has students.edit.',
  })
  @ApiOkResponse({ type: StudentDetailDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  async get(@Param('id', studentId) id: string) {
    const [detail, photoUrl] = await Promise.all([this.students.detail(id), this.photos.url(id)]);
    return { ...detail, photoUrl };
  }

  @ResponseMessage((r: { name: string; removed: boolean }) =>
    r.removed ? `Photo removed for ${r.name}.` : `Photo saved for ${r.name}.`,
  )
  @Put(':id/photo')
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Set or remove a student’s photo (JPG or PNG, 2 MB; printed on report cards)',
  })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'STUDENT_LEFT' })
  @ApiUnprocessableEntityResponse({ description: 'FILE_TYPE, FILE_TOO_LARGE' })
  setPhoto(@Param('id', studentId) id: string, @Body() dto: StudentPhotoDto) {
    return this.photos.set(id, dto.photo ?? null);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Transfer recorded.'))
  @Post(':id/transfer')
  @HttpCode(200)
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Transfer or withdraw a student, or move them to another branch',
    description:
      '`Transfer` (to another school; destination and transfer letter required) and `Withdrawal` ' +
      'end the current enrollment on the effective date, set the status, and close the ' +
      'student’s own sign-in (sessions revoked); guardians keep read-only access. They need ' +
      'students.archive too. `Branch` moves the student to another active branch (`branchId`), ' +
      'in the same class level, into `arm` there or awaiting an arm.',
  })
  @ApiOkResponse({ type: StudentRowDto })
  @ApiForbiddenResponse({ description: 'Exits need students.archive.' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'ALREADY_LEFT, STUDENT_LEFT, ARM_FULL, NOT_ENROLLED' })
  @ApiUnprocessableEntityResponse({
    description:
      'VALIDATION (date, destination, branch, arm), TRANSFER_LETTER_REQUIRED, FILE_TYPE, ' +
      'FILE_TOO_LARGE, SAME_BRANCH, LEVEL_NOT_AT_BRANCH',
  })
  transfer(@Param('id', studentId) id: string, @Body() dto: TransferStudentDto) {
    return this.moves.transfer(id, dto);
  }
}

/** School Admin › Students › Enroll: placing admitted students in an arm for the session. */
@ApiTags('school · students')
@Portals('SCHOOL_ADMIN')
@Controller()
export class EnrollmentController {
  constructor(
    private readonly students: StudentsService,
    private readonly moves: StudentMovesService,
  ) {}

  @ResponseMessage('Enrollment options loaded.')
  @Get('enrollment/options')
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'Arms with free places, and students awaiting an arm',
    description:
      'For one branch (`branch`, default the first active one): its sections, levels and arms ' +
      'with places used this session, and the students admitted there awaiting an arm.',
  })
  @ApiOkResponse({ type: EnrollmentOptionsDto })
  @ApiNotFoundResponse({ description: 'BRANCH_NOT_FOUND' })
  options(@Query() query: EnrollmentOptionsQueryDto) {
    return this.students.enrollmentOptions(query);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Students enrolled.'))
  @Post('enrollments')
  @HttpCode(200)
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Enroll students in an arm',
    description:
      'Places students awaiting an arm this session in `level` + `arm` (at their branch). All ' +
      'must be admitted into that level.',
  })
  @ApiOkResponse({ type: EnrolledDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'ALREADY_ENROLLED, ARM_FULL, NOT_ADMITTED, STUDENT_LEFT' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION (arm, level, one branch)' })
  enroll(@Body() dto: EnrollDto) {
    return this.moves.enroll(dto);
  }
}
