import { Controller, Get, Module } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { GroupOverviewService } from './group-overview.service.js';

/** School Admin › Group overview (`/v1/group`), for a school group's own staff. */
@ApiTags('school · group')
@Portals('SCHOOL_ADMIN')
@Controller('group')
export class GroupController {
  constructor(private readonly groups: GroupOverviewService) {}

  @ResponseMessage('Group overview loaded.')
  @Get('overview')
  @ApiOperation({
    summary: 'Every school of the signed-in person’s group side by side, with totals',
  })
  @ApiForbiddenResponse({ description: 'NOT_GROUP_STAFF' })
  overview(@CurrentUser() auth: AuthUserContext) {
    return this.groups.overview(auth);
  }
}

@Module({ controllers: [GroupController], providers: [GroupOverviewService] })
export class GroupModule {}
