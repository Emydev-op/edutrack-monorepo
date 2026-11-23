import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { noticeOf } from '../staff/staff-audit.js';
import { AdmissionsService } from './admissions.service.js';
import {
  AdmissionMatchesQueryDto,
  SubjectOptionsQueryDto,
  AdmitDto,
  StudentImportCommitDto,
  StudentImportDto,
} from './dto/admissions.dto.js';
import {
  AdmissionApplicationDto,
  AdmissionMatchesDto,
  AdmissionOptionsDto,
  AdmitResultDto,
  ImportBatchDto,
  ImportResultDto,
} from './dto/admissions.responses.js';
import { StudentImportService } from './student-import.service.js';

/**
 * School Admin › Students › Admissions: applications, the admission wizard and admitting a
 * student. Contract: `school-admin/src/api/mock/handlers/students.ts`. Admitting never creates
 * parent portal accounts or invitations.
 */
@ApiTags('school · admissions')
@Portals('SCHOOL_ADMIN')
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @ResponseMessage('Applications loaded.')
  @Get()
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'Admission applications',
    description: 'Every application with its stage, newest first.',
  })
  @ApiOkResponse({ type: [AdmissionApplicationDto] })
  list() {
    return this.admissions.applications();
  }

  // Static routes before any `/:id`.
  @ResponseMessage('Admission options loaded.')
  @Get('options')
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'What the admission wizard needs',
    description:
      'The active session and term, branches, arms with places used this session (per branch in ' +
      '`armsByBranch`; `arms` is the first branch’s), subjects from the curriculum, states and the ' +
      'required documents, and this term’s fees per "branch|level" from Finance’s published fee ' +
      'structures (`feeLines`; a class without one has no entry).',
  })
  @ApiOkResponse({ type: AdmissionOptionsDto })
  options() {
    return this.admissions.options();
  }

  @ResponseMessage('Subject options loaded.')
  @Get('subject-options')
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'What a class level offers this session: compulsory, religious and elective groups',
    description:
      'Elective groups come from Academics › Curriculum, each with its minimum and maximum picks; ' +
      'electives in no group are “Other electives” (no minimum). `unstaffed` lists subject ids ' +
      'with no teacher this term.',
  })
  subjectOptions(@Query() query: SubjectOptionsQueryDto) {
    return this.admissions.subjectOptions(query.branch, query.level);
  }

  @ResponseMessage('Matches checked.')
  @Get('matches')
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'Possible duplicate, sibling and existing guardian',
    description:
      '`duplicate`: a student with the same first name and surname. `guardian`: a guardian with ' +
      'the phone (or else email) given. `sibling`: that guardian’s child on roll, or else the ' +
      'latest student on roll with the same surname who has a guardian.',
  })
  @ApiOkResponse({ type: AdmissionMatchesDto })
  matches(@Query() query: AdmissionMatchesQueryDto) {
    return this.admissions.matches(query);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Student admitted.'))
  @Post()
  @HttpCode(200)
  @RequirePermission('students.create')
  @ApiOperation({
    summary: 'Admit a student',
    description:
      'Creates the student with the next admission number in the school’s format, the guardian ' +
      '(new, linked, or reused when the phone and name match one already here) with contact ' +
      'consent from the admission form, the primary guardian link and the enrollment into the ' +
      'chosen arm of the active session. Marks the application admitted. No portal accounts or ' +
      'invitations are created.',
  })
  @ApiOkResponse({ type: AdmitResultDto })
  @ApiUnprocessableEntityResponse({
    description:
      'VALIDATION (names, date of birth, documents, guardian phone or email, branch, class arm)',
  })
  @ApiNotFoundResponse({ description: 'APPLICATION_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'NO_SESSION, ARM_FULL, DUPLICATE_STUDENT, APPLICATION_ADMITTED, APPLICATION_REJECTED, ' +
      'GUARDIAN_PHONE_TAKEN',
  })
  admit(@Body() dto: AdmitDto) {
    return this.admissions.admit(dto);
  }
}

/** School Admin › Students › Import students (CSV of students with their guardians). */
@ApiTags('school · admissions')
@Portals('SCHOOL_ADMIN')
@Controller('imports')
export class StudentImportsController {
  constructor(private readonly imports: StudentImportService) {}

  @RawResponse()
  @Get('template')
  @RequirePermission('students.create')
  @ApiOperation({
    summary:
      'The student template (.xlsx): dropdowns for gender, class level, arm, relationship and state',
  })
  async template(@Query('branch') branch?: string) {
    return new StreamableFile(await this.imports.template(branch), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="edutrack-students-template.xlsx"',
    });
  }

  @ResponseMessage('File checked.')
  @Post()
  @HttpCode(200)
  @RequirePermission('students.create')
  @ApiOperation({
    summary: 'Check a CSV of students',
    description:
      'Columns: surname, first_name, gender, date_of_birth (DD/MM/YYYY), class_level, arm ' +
      '(required), other_names, guardian_name, guardian_phone, guardian_email, relationship, ' +
      'state_of_origin, previous_school, branch (else the `branch` sent, or the only branch). ' +
      'Answers the row counts and one issue per row (code class, dob, invalid, duplicate, ' +
      'guardian-match, no-guardian). Nothing is saved until the import is committed; the check ' +
      'expires after 24 hours.',
  })
  @ApiOkResponse({ type: ImportBatchDto })
  @ApiUnprocessableEntityResponse({
    description: 'IMPORT_FORMAT, IMPORT_EMPTY, IMPORT_COLUMNS, IMPORT_TOO_LONG, IMPORT_BRANCH',
  })
  @ApiConflictResponse({ description: 'NO_SESSION' })
  preview(@Body() dto: StudentImportDto) {
    return this.imports.preview(dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Students imported.'))
  @Post(':id/commit')
  @HttpCode(200)
  @RequirePermission('students.create')
  @ApiOperation({
    summary: 'Import the checked file',
    description:
      'Applies the fixes chosen per row, checks every row again and, in one transaction, creates ' +
      'the students (admission numbers), guardians (consent source "import"), links and ' +
      'enrollments. With rows still in error it answers 422 unless `excludeErrors`.',
  })
  @ApiOkResponse({ type: ImportResultDto })
  @ApiNotFoundResponse({ description: 'IMPORT_EXPIRED (unknown, used or older than 24 hours)' })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_HAS_ERRORS, IMPORT_NOTHING_VALID' })
  @ApiConflictResponse({ description: 'NO_SESSION, ARM_FULL' })
  commit(@Param('id') id: string, @Body() dto: StudentImportCommitDto) {
    return this.imports.commit(id, dto);
  }
}
