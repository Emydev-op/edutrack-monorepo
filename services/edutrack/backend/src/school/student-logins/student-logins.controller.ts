import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { noticeOf, plural, withNotice } from '../staff/staff-audit.js';
import {
  CreateStudentLoginsDto,
  StudentLoginsQueryDto,
  StudentLoginsResultDto,
  StudentLoginsViewDto,
} from './dto/student-logins.dto.js';
import { StudentLoginsService } from './student-logins.service.js';

/**
 * School Admin › Students › Student logins. Register this module before any `/v1/students/:id`
 * route so `/v1/students/logins` isn't taken for an id.
 */
@ApiTags('school · student logins')
@Portals('SCHOOL_ADMIN')
@Controller('students/logins')
export class StudentLoginsController {
  constructor(private readonly logins: StudentLoginsService) {}

  @ResponseMessage('Student logins loaded.')
  @Get()
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Current students with their Student Portal login state',
    description:
      'Every current student (by surname) with their class, section, whether the section has ' +
      'logins on, and the login state. Passwords are never shown here.',
  })
  @ApiOkResponse({ type: StudentLoginsViewDto })
  view(@Query() query: StudentLoginsQueryDto) {
    return this.logins.view(query);
  }

  @ResponseMessage((r: unknown) => noticeOf(r, 'Student logins created.'))
  @Post()
  @HttpCode(200)
  @RequirePermission('settings.users')
  @ApiOperation({
    summary: 'Create Student Portal logins and their login slips',
    description:
      'For students in sections with logins on: everyone without a login, one class or level ' +
      '(`className`), or the listed students. Each gets a one-time password on a printable slip ' +
      '(name, class, admission number, the school’s Student Portal address). Passwords are ' +
      'shown in this answer only and must be changed at the first sign-in. `reissue` gives ' +
      'students who already have a login a new password.',
  })
  @ApiOkResponse({ type: StudentLoginsResultDto })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION: no matching students, too many.' })
  async create(@Body() dto: CreateStudentLoginsDto) {
    const result = await this.logins.create(dto);
    const done = result.created + result.reissued;
    const message = done
      ? `${plural(done, 'login slip')} ready. Print them now: the passwords are shown once.`
      : 'Every student already has a login.';
    return withNotice(result, message);
  }
}
