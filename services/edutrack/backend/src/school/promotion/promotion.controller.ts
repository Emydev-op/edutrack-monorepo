import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentTenant } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { SavePromotionDto } from './dto/promotion.dto.js';
import { PromotionService } from './promotion.service.js';

/**
 * School Admin › Academics › Promotion: end-of-session decisions per class (a class level at a
 * branch, `<levelId>~<branchId>`), suggested from each section's rule, then applied into the
 * next session. Section admins decide and apply only for their sections.
 */
@ApiTags('school · promotion')
@Portals('SCHOOL_ADMIN')
@Controller('academics/promotion')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @ResponseMessage('Promotion loaded.')
  @Get()
  @RequirePermission('students.view')
  @ApiQuery({
    name: 'class',
    required: false,
    description: 'Class id `<levelId>~<branchId>`; the first class still pending when omitted',
  })
  @ApiOperation({
    summary: 'A class’s students with annual averages, eligibility and decisions',
    description:
      'Promotes from the Active session (or a Closing one whose students are still on its roll) ' +
      'into the next session. Eligibility is unknown, with no suggestion, for students without ' +
      'published results this session.',
  })
  view(@Query('class') classId?: string) {
    return this.promotion.view(classId);
  }

  @ResponseMessage('Decisions saved.')
  @Put(':classId')
  @RequirePermission('students.promote')
  @ApiOperation({ summary: 'Save draft decisions (and reasons) for a class' })
  @ApiNotFoundResponse({ description: 'CLASS_NOT_FOUND' })
  @ApiForbiddenResponse({ description: 'SECTION_FORBIDDEN' })
  @ApiConflictResponse({ description: 'ALREADY_APPLIED' })
  @ApiUnprocessableEntityResponse({ description: 'DECISION_INVALID · VALIDATION' })
  save(
    @CurrentTenant() schoolId: string,
    @Param('classId') classId: string,
    @Body() dto: SavePromotionDto,
  ) {
    return this.promotion.save(schoolId, classId, dto.decisions);
  }

  @ResponseMessage('Decisions applied.')
  @Post(':classId/apply')
  @HttpCode(200)
  @RequirePermission('students.promote')
  @ApiOperation({
    summary: 'Apply a class’s decisions',
    description:
      'Every student needs a decision (and a reason where it goes against the rule). Promoted ' +
      'and repeating students are enrolled into the next session (the same arm letter when it ' +
      'exists and has room, else awaiting an arm); graduates and leavers leave at the end of ' +
      'the session. The class is then read-only.',
  })
  @ApiNotFoundResponse({ description: 'CLASS_NOT_FOUND' })
  @ApiForbiddenResponse({ description: 'SECTION_FORBIDDEN' })
  @ApiConflictResponse({ description: 'ALREADY_APPLIED · NO_NEXT_SESSION' })
  @ApiUnprocessableEntityResponse({
    description:
      'UNDECIDED · REASON_REQUIRED · DECISION_INVALID · FEES_OUTSTANDING · NEXT_LEVEL_NOT_RUN',
  })
  apply(@CurrentTenant() schoolId: string, @Param('classId') classId: string) {
    return this.promotion.apply(schoolId, classId);
  }
}
