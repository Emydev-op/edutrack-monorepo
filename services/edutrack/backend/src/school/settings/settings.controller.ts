import { PlanLimitsService } from '../shared/plan-limits.service.js';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import {
  OpenWhenLapsed,
  Portals,
  RequirePermission,
} from '../../auth/decorators/auth.decorators.js';
import { ChangePasswordDto } from '../../auth/dto/auth.dto.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import {
  AcademicPolicyDto,
  FinanceTogglesDto,
  NumberingDto,
  SettingsHistoryQuery,
  SignInRulesDto,
} from './dto/settings.dto.js';
import { SettingsSecurityService } from './settings-security.service.js';
import { SchoolSettingsService } from './settings.service.js';

/**
 * School Admin › Settings. Every School Admin member can see the tabs; changing the school's
 * settings needs `settings.profile` (numbering, finance switches), `academics.configure` (academic
 * switches) or `settings.users` (staff sign-in rules). The Security tab's own-account actions
 * (password, devices) are open to everyone, also while the subscription has lapsed.
 */
@ApiTags('school · settings')
@Portals('SCHOOL_ADMIN')
@Controller('settings')
export class SchoolSettingsController {
  constructor(
    private readonly settings: SchoolSettingsService,
    private readonly security: SettingsSecurityService,
    private readonly limitsSvc: PlanLimitsService,
  ) {}

  @ResponseMessage('Settings loaded.')
  @Get('school')
  @ApiOperation({
    summary: 'Localisation, numbering formats, billing prefixes and setup progress',
    description:
      'Localisation is set by EduTrack at provisioning. `numbering[].next` is the number the next ' +
      'record gets; `nextSeq` its running number, for previewing an edited format.',
  })
  school() {
    return this.settings.school();
  }

  @ResponseMessage('Numbering formats saved.')
  @Put('numbering')
  @RequirePermission('settings.profile')
  @ApiOperation({
    summary: 'Change the admission number and staff ID formats',
    description:
      'Either or both. Codes: [YYYY], [YY] and one running number [###]–[######]. Numbers ' +
      'already given out keep their format. Answers the School tab.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION (format, same prefix for both)' })
  @ApiConflictResponse({ description: 'NUMBER_IN_USE: the next number already exists' })
  saveNumbering(@Body() dto: NumberingDto) {
    return this.settings.saveNumbering(dto);
  }

  @ResponseMessage('Academic settings loaded.')
  @Get('academic')
  @ApiOperation({
    summary: 'Result and promotion switches, with the session, pass mark and schemes',
  })
  academic() {
    return this.settings.academic();
  }

  @ResponseMessage('Academic settings saved.')
  @Put('academic')
  @RequirePermission('academics.configure')
  @ApiOperation({ summary: 'Turn result and promotion switches on or off (any of them)' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  saveAcademic(@Body() dto: AcademicPolicyDto) {
    return this.settings.saveAcademic(dto);
  }

  @ResponseMessage('Finance settings loaded.')
  @Get('finance')
  @ApiOperation({ summary: 'Part payments, sibling discount and transfer verification switches' })
  finance() {
    return this.settings.finance();
  }

  @ResponseMessage('Finance settings saved.')
  @Put('finance')
  @RequirePermission('settings.profile')
  @ApiOperation({ summary: 'Turn finance switches on or off (any of them)' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  saveFinance(@Body() dto: FinanceTogglesDto) {
    return this.settings.saveFinance(dto);
  }

  @ResponseMessage('Plan limits loaded.')
  @Get('limits')
  @ApiOperation({
    summary: 'Students and staff logins against the plan’s limits (warn from 90%, refuse at 100%)',
  })
  async limits() {
    const [students, users] = await Promise.all([
      this.limitsSvc.students(),
      this.limitsSvc.users(),
    ]);
    return { students, users };
  }

  @ResponseMessage('Subscription loaded.')
  @Get('subscription')
  @ApiOperation({
    summary: 'The school’s plan, renewal, usage and SMS credit (read-only)',
    description:
      'Set by EduTrack. `status`: Active, Renewal due (30 days or less), Overdue (grace ' +
      'period) or Restricted (restricted, expired or cancelled: School Admin is view-only). ' +
      'Renewing, changing plan and buying SMS credit are requests to EduTrack through Support.',
  })
  @ApiNotFoundResponse({ description: 'NO_SUBSCRIPTION' })
  subscription() {
    return this.settings.subscription();
  }

  @ResponseMessage('Modules loaded.')
  @Get('modules')
  @ApiOperation({ summary: 'Every module: Active, Not on plan or Coming soon (read-only)' })
  @ApiNotFoundResponse({ description: 'NO_SUBSCRIPTION' })
  modules() {
    return this.settings.modules();
  }

  @ResponseMessage('Security settings loaded.')
  @Get('security')
  @ApiOperation({
    summary: 'Your account, your signed-in devices and the staff sign-in rules',
  })
  securityView(@CurrentUser() auth: AuthUserContext) {
    return this.security.view(auth);
  }

  @ResponseMessage((r: { signedOut: number }) =>
    r.signedOut
      ? `Password changed. ${r.signedOut} other device${r.signedOut === 1 ? ' was' : 's were'} signed out.`
      : 'Password changed.',
  )
  @Post('security/password')
  @HttpCode(200)
  @OpenWhenLapsed()
  @ApiOperation({
    summary: 'Change your password',
    description: 'Keeps this session and ends the others. Answers `{ signedOut, view }`.',
  })
  @ApiUnprocessableEntityResponse({ description: 'fields.current or fields.next' })
  changePassword(@CurrentUser() auth: AuthUserContext, @Body() dto: ChangePasswordDto) {
    return this.security.changePassword(auth, dto);
  }

  @ResponseMessage('Device signed out.')
  @Delete('security/sessions/:id')
  @OpenWhenLapsed()
  @ApiOperation({ summary: 'Sign out one of your other devices' })
  @ApiNotFoundResponse({ description: 'SESSION_ENDED' })
  @ApiConflictResponse({ description: 'CURRENT_SESSION: use sign out instead' })
  endSession(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.security.endSession(auth, id);
  }

  @ResponseMessage('Other devices signed out.')
  @Post('security/sessions/sign-out-others')
  @HttpCode(200)
  @OpenWhenLapsed()
  @ApiOperation({ summary: 'Sign out every other device' })
  signOutOthers(@CurrentUser() auth: AuthUserContext) {
    return this.security.signOutOthers(auth);
  }

  @ResponseMessage('Sign-in rules saved. They apply from the next sign-in.')
  @Put('security/rules')
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Staff sign-in rules: idle sign-out, lockout and password expiry',
    description:
      'Any of them. Lockout and password expiry are what sign-in enforces for this school. ' +
      'passwordExpiryDays 0 means passwords never expire.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION (out of range)' })
  saveRules(@CurrentUser() auth: AuthUserContext, @Body() dto: SignInRulesDto) {
    return this.security.saveRules(auth, dto);
  }

  @ResponseMessage('Change history loaded.')
  @Get('history')
  @ApiOperation({ summary: 'Settings changes, newest first, optionally for one area' })
  history(@Query() q: SettingsHistoryQuery) {
    return this.settings.history(q.area);
  }
}
