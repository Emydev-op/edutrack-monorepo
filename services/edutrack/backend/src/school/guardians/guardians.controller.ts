import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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
import { ResponseMessage } from '../../common/http/api-response.js';
import { noticeOf, plural, withNotice } from '../staff/staff-audit.js';
import {
  GuardianPayloadDto,
  GuardianQueryDto,
  InviteGuardiansDto,
  MergeGuardiansDto,
} from './dto/guardians.dto.js';
import {
  GuardianDetailDto,
  GuardianInviteResultDto,
  GuardianListDto,
  GuardianRowDto,
} from './dto/guardians.responses.js';
import { GuardianAccountsService } from './guardian-accounts.service.js';
import { GuardiansService } from './guardians.service.js';

const NOT_FOUND = 'GUARDIAN_NOT_FOUND: this guardian doesn’t exist (or belongs to another school).';
const INVITE_REFUSALS =
  'ALREADY_ACTIVE, ACCOUNT_SUSPENDED, ACCOUNT_CONFLICT (phone and email are two accounts), ' +
  'GUARDIAN_DUPLICATE (the parent has an account here on another record: merge first), ' +
  'INVITATION_PENDING, ACCOUNT_BLOCKED';

/**
 * School Admin › Students › Parents / Guardians: the list, a guardian's page, adding a guardian to
 * children, merging duplicates, and Parent Portal invitations (manual, one at a time or in bulk).
 * Contract: `school-admin/src/api/mock/handlers/students.ts`.
 */
@ApiTags('school · guardians')
@Portals('SCHOOL_ADMIN')
@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly accounts: GuardianAccountsService,
  ) {}

  @ResponseMessage('Guardians loaded.')
  @Get()
  @RequirePermission('students.view')
  @ApiOperation({
    summary: 'Guardians, by name',
    description:
      'A page of guardians (search: name, phone, email or a child’s name) with each one’s children, ' +
      'portal account and balance, plus records sharing a phone number (`duplicates`) and the ' +
      'number of current students with no guardian.',
  })
  @ApiOkResponse({ type: GuardianListDto })
  list(@Query() query: GuardianQueryDto) {
    return this.guardians.list(query);
  }

  /* Static paths before `/:id`. */

  @ResponseMessage((r: unknown) => noticeOf(r, 'Invitations sent.'))
  @Post('invite')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Invite guardians to the Parent Portal',
    description:
      'The listed guardians (`ids`), or every guardian without an account, optionally only those ' +
      'with a child in a class (`className`) or at a branch (`branchId`). Pending invitations are ' +
      'resent. The link goes by SMS and, when they have one, by email. Guardians who can’t be ' +
      'invited are listed in `skipped` with the reason.',
  })
  @ApiOkResponse({ type: GuardianInviteResultDto })
  async inviteMany(@Body() dto: InviteGuardiansDto) {
    const { invited, skipped, sentTo } = await this.accounts.inviteMany(dto);
    const message =
      invited === 0
        ? skipped.length === 1
          ? `${skipped[0]!.name}: ${skipped[0]!.reason}`
          : 'Nobody to invite.'
        : invited === 1 && dto.ids?.length === 1
          ? `Invitation sent to ${sentTo[0]}.`
          : `${plural(invited, 'invitation')} sent.${skipped.length ? ` ${plural(skipped.length, 'guardian')} skipped.` : ''}`;
    return withNotice({ invited, skipped }, message);
  }

  @ResponseMessage('Guardians merged. Children and payment history are on one record now.')
  @Post('merge')
  @HttpCode(200)
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Merge two records of the same guardian',
    description:
      'Moves the duplicate’s children, payments and messages to the kept record, fills in its ' +
      'blank contact details and keeps the better Parent Portal account (an active one wins). ' +
      'The duplicate stays for history with `mergedIntoId` set. Not reversible.',
  })
  @ApiOkResponse({ type: GuardianRowDto })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION: not two different guardians.' })
  async merge(@Body() dto: MergeGuardiansDto) {
    const { id, endedUserId } = await this.guardians.merge(dto.keepId, dto.mergeId);
    if (endedUserId) await this.accounts.endParentSessions(endedUserId);
    return this.guardians.row(id);
  }

  @ResponseMessage('Guardian loaded.')
  @Get(':id')
  @RequirePermission('students.view')
  @ApiOperation({ summary: 'A guardian’s page: children, contact, fees and portal account' })
  @ApiOkResponse({ type: GuardianDetailDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  detail(@Param('id') id: string) {
    return this.guardians.detail(id);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Guardian added.'))
  @Post()
  @RequirePermission('students.edit')
  @ApiOperation({
    summary: 'Add a guardian to one or more children',
    description:
      'The phone number and email are checked against existing guardians first, so one parent ' +
      'keeps one record. With `invite` (needs settings.users too) the Parent Portal invitation is ' +
      'sent at once; otherwise the school invites them later.',
  })
  @ApiCreatedResponse({ type: GuardianRowDto })
  @ApiConflictResponse({
    description: 'GUARDIAN_EXISTS: the phone or email is another guardian’s.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION (name, phone, email, children).' })
  async add(@Body() dto: GuardianPayloadDto) {
    if (dto.invite) await this.accounts.requireInvitePermission();
    const id = await this.guardians.add(dto);
    let invited = false;
    if (dto.invite) {
      await this.accounts.inviteOne(id);
      invited = true;
    }
    const row = await this.guardians.row(id);
    return withNotice(
      row,
      `${row.name} added${invited ? ' and invited to the parent portal' : ''}.`,
    );
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Invitation sent.'))
  @Post(':id/invite')
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Invite a guardian to the Parent Portal (or resend)',
    description:
      'Reuses the EduTrack account that already has their phone number or email (a parent with ' +
      'children at another school keeps one login), else creates one. The link goes by SMS and, ' +
      'when they have one, by email.',
  })
  @ApiOkResponse({ type: GuardianRowDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: INVITE_REFUSALS })
  @ApiUnprocessableEntityResponse({ description: 'NO_CONTACT, NO_CURRENT_CHILD' })
  async invite(@Param('id') id: string) {
    const { sentTo, resent } = await this.accounts.inviteOne(id);
    return withNotice(
      await this.guardians.row(id),
      `Invitation ${resent ? 'resent' : 'sent'} to ${sentTo}.`,
    );
  }

  @ResponseMessage('Invitation withdrawn.')
  @Delete(':id/invite')
  @RequirePermission('settings.users')
  @ApiOperation({ summary: 'Withdraw a pending Parent Portal invitation' })
  @ApiOkResponse({ type: GuardianRowDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'NO_PENDING_INVITATION' })
  async revoke(@Param('id') id: string) {
    await this.accounts.revoke(id);
    return this.guardians.row(id);
  }
}
