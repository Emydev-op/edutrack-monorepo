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
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiForbiddenResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { RawResponse, ResponseMessage } from '../../common/http/api-response.js';
import { InsightsResultsService } from '../insights/insights-results.service.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { CHANNELS, type Channel } from '../communication/comms-catalog.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { ResultsModule } from '../results/results.module.js';
import {
  GROUP_AUDIENCES,
  GroupAnnouncementsService,
  type GroupAudience,
} from './group-announcements.service.js';
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

export class GroupAudienceDto {
  @ApiProperty({ enum: GROUP_AUDIENCES })
  @IsIn(GROUP_AUDIENCES, { message: 'Choose who the announcement is for.' })
  audience!: GroupAudience;

  @ApiProperty({ type: [String], enum: CHANNELS })
  @IsArray()
  @IsIn(CHANNELS, { each: true, message: 'Choose In-app, Email or SMS.' })
  channels!: Channel[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  smsText?: string;

  @ApiProperty({ type: [String], description: 'The group’s schools to send it in' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsArray()
  schoolIds!: string[];
}

export class GroupAnnouncementDto extends GroupAudienceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body!: string;
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
    private readonly announcements: GroupAnnouncementsService,
  ) {}

  @ResponseMessage('Recipients counted.')
  @Post('announcements/preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Who a group announcement reaches in each chosen school, and the SMS units it needs',
  })
  @ApiForbiddenResponse({ description: 'NOT_GROUP_STAFF, GROUP_ROLE_FORBIDDEN (owner only)' })
  previewAnnouncement(@CurrentUser() auth: AuthUserContext, @Body() dto: GroupAudienceDto) {
    return this.announcements.preview(auth, dto);
  }

  @ResponseMessage(
    (r: { sent: number; results: unknown[]; recipients: number }) =>
      `Sent in ${r.sent} of ${r.results.length} schools to ${r.recipients.toLocaleString('en-NG')} recipients.`,
  )
  @Post('announcements')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Send one announcement in several of the group’s schools (each school sends its own copy)',
  })
  @ApiForbiddenResponse({ description: 'NOT_GROUP_STAFF, GROUP_ROLE_FORBIDDEN (owner only)' })
  sendAnnouncement(@CurrentUser() auth: AuthUserContext, @Body() dto: GroupAnnouncementDto) {
    return this.announcements.send(auth, dto);
  }

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
    summary:
      'Save a template (grading, fees, roles, messages, term dates, subjects, policies, branding) from a member school',
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
  imports: [ResultsModule, AcademicsModule, CommunicationModule],
  controllers: [GroupController],
  providers: [
    GroupOverviewService,
    GroupTemplatesService,
    GroupReportsService,
    GroupAnnouncementsService,
    InsightsResultsService,
  ],
})
export class GroupModule {}
