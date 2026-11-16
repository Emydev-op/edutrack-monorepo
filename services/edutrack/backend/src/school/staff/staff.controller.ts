import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import {
  DeactivateStaffDto,
  InviteStaffDto,
  StaffImportDto,
  StaffPayloadDto,
  StaffQueryDto,
  UploadStaffDocumentDto,
} from './dto/staff.dto.js';
import {
  InviteResultDto,
  StaffDetailDto,
  StaffDocumentRowDto,
  StaffFormOptionsDto,
  StaffImportBatchDto,
  StaffImportResultDto,
  StaffListDto,
  StaffListRowDto,
  StaffSavedDto,
  TeacherRowDto,
} from './dto/staff.responses.js';
import { StaffAccountsService } from './staff-accounts.service.js';
import { noticeOf, plural, withNotice } from './staff-audit.js';
import { StaffDocumentsService } from './staff-documents.service.js';
import { StaffImportService } from './staff-import.service.js';
import { CanReadStaff } from './staff-read.guard.js';
import { StaffService } from './staff.service.js';

const NOT_FOUND =
  'STAFF_NOT_FOUND: this staff member doesn’t exist (or belongs to another school).';
const VALIDATION =
  'VALIDATION (phone, email, branches, start date, periods, role), PHONE_TAKEN, EMAIL_TAKEN.';

/**
 * School Admin › Staff: the directory, profiles, add/edit, documents, invitations, deactivation and
 * CSV import. Contract: `school-admin/src/api/mock/handlers/staff.ts`.
 */
@ApiTags('school · staff')
@Portals('SCHOOL_ADMIN')
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly accounts: StaffAccountsService,
    private readonly documents: StaffDocumentsService,
    private readonly imports: StaffImportService,
  ) {}

  @ResponseMessage('Staff loaded.')
  @Get()
  @CanReadStaff()
  @ApiOperation({
    summary: 'The staff directory',
    description:
      'Every staff member (active first, by surname) with the tab counts, accounts, teaching load ' +
      'this term and the setup warnings. Filters: search, group (or "No access"), branch name, ' +
      'account and status. Needs settings.users or academics.view.',
  })
  @ApiOkResponse({ type: StaffListDto })
  list(@Query() query: StaffQueryDto) {
    return this.staff.list(query);
  }

  @ResponseMessage('Form options loaded.')
  @Get('form-options')
  @CanReadStaff()
  @ApiOperation({ summary: 'Branches, positions, departments, roles and subjects for the form' })
  @ApiOkResponse({ type: StaffFormOptionsDto })
  formOptions() {
    return this.staff.formOptions();
  }

  @ResponseMessage('Teachers loaded.')
  @Get('teachers')
  @CanReadStaff()
  @ApiOperation({ summary: 'Teaching staff with this term’s load, heaviest first' })
  @ApiOkResponse({ type: [TeacherRowDto] })
  teachers() {
    return this.staff.teachers();
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Invitations sent.'))
  @Post('invite')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Invite staff to Edutrack',
    description:
      'Invites each person with the usual role for their position (Bursar → Bursar, teachers → ' +
      'Teacher), or resends a pending invitation. People with no email, an account already, or ' +
      'no obvious role are listed in `skipped`.',
  })
  @ApiOkResponse({ type: InviteResultDto })
  async invite(@Body() dto: InviteStaffDto) {
    const { invited, skipped, emails } = await this.accounts.inviteMany(dto.ids);
    const result = { invited, skipped };
    const message =
      invited === 0
        ? 'Nobody to invite.'
        : dto.ids.length === 1
          ? `Invitation sent to ${emails[0]}.`
          : `${plural(invited, 'invitation')} sent.`;
    return withNotice(result, message);
  }

  @ResponseMessage('File checked.')
  @Post('import')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Check a CSV of staff',
    description:
      'Columns: first_name, last_name, type, position, branch (required), email, phone, ' +
      'portal_access, role. Every row comes back with its errors and warnings; nothing is saved ' +
      'until the import is committed.',
  })
  @ApiOkResponse({ type: StaffImportBatchDto })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_EMPTY, IMPORT_COLUMNS, IMPORT_TOO_LONG' })
  preview(@Body() dto: StaffImportDto) {
    return this.imports.preview(dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Staff imported.'))
  @Post('import/:id/commit')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Import the valid rows',
    description: 'Creates the staff (rows with errors are skipped) and sends their invitations.',
  })
  @ApiOkResponse({ type: StaffImportResultDto })
  @ApiNotFoundResponse({ description: 'IMPORT_EXPIRED: upload the file again.' })
  @ApiUnprocessableEntityResponse({ description: 'IMPORT_NOTHING_VALID' })
  commit(@Param('id') id: string) {
    return this.imports.commit(id);
  }

  @ResponseMessage('Staff member loaded.')
  @Get(':id')
  @CanReadStaff()
  @ApiOperation({ summary: 'A staff profile: details, documents, account, teaching, history' })
  @ApiOkResponse({ type: StaffDetailDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(@Param('id') id: string) {
    return this.staff.get(id);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Staff member added.'))
  @Post()
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Add a staff member',
    description:
      'Gives them the next staff ID in the school’s format. With `access` on, creates their ' +
      'Edutrack account with `role` and emails the invitation.',
  })
  @ApiOkResponse({ type: StaffListRowDto })
  @ApiUnprocessableEntityResponse({ description: VALIDATION })
  create(@Body() dto: StaffPayloadDto) {
    return this.staff.create(dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Changes saved.'))
  @Put(':id')
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Edit a staff member',
    description:
      'Becoming non-teaching, or leaving a branch, clears their assignments there (`cleared`). ' +
      'Turning access on invites them; off withdraws a pending invitation; a new email on a ' +
      'pending invitation sends a new one.',
  })
  @ApiOkResponse({ type: StaffSavedDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'STAFF_DEACTIVATED: reactivate them first.' })
  @ApiUnprocessableEntityResponse({ description: VALIDATION })
  update(@Param('id') id: string, @Body() dto: StaffPayloadDto) {
    return this.staff.update(id, dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Staff member deactivated.'))
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Deactivate a staff member',
    description:
      'Clears their teaching (cover must be confirmed), organogram posts and branch headship, ' +
      'and ends their Edutrack access: the account is deactivated (or the invitation withdrawn) ' +
      'and their sessions at this school are signed out.',
  })
  @ApiOkResponse({ type: StaffSavedDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({
    description: 'ALREADY_DEACTIVATED, CANNOT_DEACTIVATE_SELF, ONLY_HOLDER (top of the organogram)',
  })
  @ApiUnprocessableEntityResponse({ description: 'COVER_NOT_CONFIRMED' })
  deactivate(@Param('id') id: string, @Body() dto: DeactivateStaffDto) {
    return this.staff.deactivate(id, dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Staff member reactivated.'))
  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Reactivate a staff member',
    description: 'Restores the record; access is granted again separately (Users & Roles).',
  })
  @ApiOkResponse({ type: StaffListRowDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'STAFF_ACTIVE' })
  reactivate(@Param('id') id: string) {
    return this.staff.reactivate(id);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Document uploaded.'))
  @Post(':id/documents')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Upload a document',
    description:
      'The file is a data URL (PDF, JPG or PNG up to 5 MB, checked by its bytes). A new upload ' +
      'of the same kind replaces the file. Answers the documents list (with signed links).',
  })
  @ApiOkResponse({ type: [StaffDocumentRowDto] })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiUnprocessableEntityResponse({ description: 'FILE_TYPE, FILE_TOO_LARGE, VALIDATION' })
  upload(@Param('id') id: string, @Body() dto: UploadStaffDocumentDto) {
    return this.documents.upload(id, dto);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Document verified.'))
  @Post(':id/documents/:docId/verify')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Verify a pending document' })
  @ApiOkResponse({ type: [StaffDocumentRowDto] })
  @ApiNotFoundResponse({ description: `${NOT_FOUND} DOCUMENT_NOT_FOUND.` })
  @ApiConflictResponse({ description: 'DOCUMENT_NOT_PENDING' })
  verify(@Param('id') id: string, @Param('docId') docId: string) {
    return this.documents.verify(id, docId);
  }
}
