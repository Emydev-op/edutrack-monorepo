import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { GuardianSubmissionDto } from './dto/homework.dto.js';
import { FamilyHomeworkService } from './family-homework.service.js';

const studentId = new RecordIdPipe('That child isn’t linked to your account.');
const assignmentId = new RecordIdPipe('That assignment doesn’t exist.');

/**
 * Parent Portal › a child's homework. Read: assignments (status, and score and feedback once
 * returned) and the class's materials. Write: a parent hands in a primary pupil's work.
 */
@ApiTags('parent portal')
@Portals('PARENT')
@Controller('parent/children/:studentId')
export class ParentHomeworkController {
  constructor(private readonly family: FamilyHomeworkService) {}

  @ResponseMessage('Homework loaded.')
  @Get('homework')
  @ApiQuery({ name: 'term', required: false })
  @ApiOperation({ summary: 'A child’s assignments and materials for the term' })
  homework(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Query('term') term?: string,
  ) {
    return this.family.forGuardian(auth, id, term);
  }

  @ResponseMessage((a: { late: boolean }) =>
    a.late
      ? 'Work handed in late. The teacher can see it now.'
      : 'Work handed in. The teacher can see it now.',
  )
  @Post('assignments/:assignmentId/submission')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hand in a primary pupil’s work (files from POST /v1/uploads)',
    description:
      'Only for children whose section has no Student Portal logins; the teacher sees who handed ' +
      'it in. Can be replaced until the teacher grades it.',
  })
  @ApiForbiddenResponse({ description: 'STUDENT_SUBMITS: the child hands in their own work' })
  @ApiConflictResponse({ description: 'TERM_LOCKED' })
  submit(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId', studentId) id: string,
    @Param('assignmentId', assignmentId) aid: string,
    @Body() dto: GuardianSubmissionDto,
  ) {
    return this.family.submitForChild(auth, id, aid, dto);
  }
}
