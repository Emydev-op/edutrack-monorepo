import { Body, Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, IsUUID } from 'class-validator';
import { ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { GroupOverviewService } from './group-overview.service.js';
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

/** School Admin › Group overview (`/v1/group`), for a school group's own staff. */
@ApiTags('school · group')
@Portals('SCHOOL_ADMIN')
@Controller('group')
export class GroupController {
  constructor(
    private readonly groups: GroupOverviewService,
    private readonly templates: GroupTemplatesService,
  ) {}

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
  controllers: [GroupController],
  providers: [GroupOverviewService, GroupTemplatesService],
})
export class GroupModule {}
