import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, IsUUID } from 'class-validator';
import { ApiForbiddenResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { InsightsResultsService } from '../insights/insights-results.service.js';
import { ResultsModule } from '../results/results.module.js';
import { GroupOverviewService } from './group-overview.service.js';
import { GroupReportsService, type Period } from './group-reports.service.js';
import { GroupTemplatesService } from './group-templates.service.js';

export class TemplateSourceDto {
  @ApiProperty({ description: 'The member school to save the template from' })
  @IsUUID('all', { message: 'Choose a school.' })
  schoolId!: string;
}

export class TemplateTargetsDto {
  @ApiProperty({ type: [String], description: 'Member schools to copy the template into' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsArray()
  schoolIds!: string[];
}

const periodOf = (p?: string): Period => (p === 'previous' ? 'previous' : 'current');

/** School Admin › Group overview (`/v1/group`), for a school group's own staff. */
@ApiTags('school · group')
@Portals('SCHOOL_ADMIN')
@Controller('group')
export class GroupController {
  constructor(
    private readonly groups: GroupOverviewService,
    private readonly templates: GroupTemplatesService,
    private readonly reports: GroupReportsService,
  ) {}

  @ResponseMessage('Group reports loaded.')
  @Get('reports')
  @ApiOperation({
    summary:
      'Each school side by side for a term, compared with the term before: results, attendance, fees, enrolment and staff',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['current', 'previous'] })
  @ApiForbiddenResponse({ description: 'NOT_GROUP_STAFF' })
  groupReports(@CurrentUser() auth: AuthUserContext, @Query('period') period?: string) {
    return this.reports.report(auth, periodOf(period));
  }

  @RawResponse()
  @Get('reports/export')
  @ApiOperation({ summary: 'The group reports as an Excel workbook (.xlsx), one sheet per part' })
  @ApiQuery({ name: 'period', required: false, enum: ['current', 'previous'] })
  async exportReports(@CurrentUser() auth: AuthUserContext, @Query('period') period?: string) {
    const { buffer, fileName } = await this.reports.workbook(auth, periodOf(period));
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @ResponseMessage('Group overview loaded.')
  @Get('overview')
  @ApiOperation({
    summary: 'Every school of the signed-in person’s group side by side, with totals',
  })
  @ApiForbiddenResponse({ description: 'NOT_GROUP_STAFF' })
  overview(@CurrentUser() auth: AuthUserContext) {
    return this.groups.overview(auth);
  }

  @ResponseMessage('Group templates loaded.')
  @Get('templates')
  @ApiOperation({
    summary: 'The group’s shared setup, and whether each school matches it, differs or has none',
  })
  listTemplates(@CurrentUser() auth: AuthUserContext) {
    return this.templates.list(auth);
  }

  @ResponseMessage((r: { label: string; school: string }) => `${r.label} saved from ${r.school}.`)
  @Post('templates/:key/save')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save a template (grading, fees, roles, messages) from a member school',
  })
  saveTemplate(
    @CurrentUser() auth: AuthUserContext,
    @Param('key') key: string,
    @Body() dto: TemplateSourceDto,
  ) {
    return this.templates.save(auth, key, dto.schoolId);
  }

  @ResponseMessage(
    (r: { label: string; results: { applied: boolean }[] }) =>
      `${r.label} applied to ${r.results.filter((x) => x.applied).length} of ${r.results.length} schools.`,
  )
  @Post('templates/:key/apply')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Copy a template into the member schools chosen (each keeps its own copy)',
  })
  applyTemplate(
    @CurrentUser() auth: AuthUserContext,
    @Param('key') key: string,
    @Body() dto: TemplateTargetsDto,
  ) {
    return this.templates.apply(auth, key, dto.schoolIds);
  }
}

@Module({
  imports: [ResultsModule],
  controllers: [GroupController],
  providers: [
    GroupOverviewService,
    GroupTemplatesService,
    GroupReportsService,
    InsightsResultsService,
  ],
})
export class GroupModule {}
