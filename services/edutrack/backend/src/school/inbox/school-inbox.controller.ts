import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals, OpenWhenLapsed } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { SchoolInboxService } from './school-inbox.service.js';

class InboxQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'unread'] })
  @IsOptional()
  @IsIn(['all', 'unread'], { message: 'Unknown filter.' })
  filter?: 'all' | 'unread';
}

/** School Admin's header bell, Communication › Inbox and sidebar counts. */
@ApiTags('school inbox')
@Portals('SCHOOL_ADMIN')
@OpenWhenLapsed()
@Controller()
export class SchoolInboxController {
  constructor(private readonly inbox: SchoolInboxService) {}

  @Get('notifications')
  @ResponseMessage('Notifications loaded.')
  @ApiOperation({ summary: 'The signed-in admin’s latest notifications in this school' })
  latest(@CurrentUser() auth: AuthUserContext) {
    return this.inbox.latest(auth);
  }

  @Get('comms/inbox')
  @ResponseMessage('Inbox loaded.')
  @ApiOperation({ summary: 'Every notification, paged, with unread and total counts' })
  list(@CurrentUser() auth: AuthUserContext, @Query() q: InboxQuery) {
    return this.inbox.inbox(auth, q);
  }

  @Post('notifications/read-all')
  @ResponseMessage('All notifications marked read.')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every notification read' })
  readAll(@CurrentUser() auth: AuthUserContext) {
    return this.inbox.readAll(auth);
  }

  @Post('notifications/:id/read')
  @ResponseMessage('Notification marked read.')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one notification read' })
  read(@CurrentUser() auth: AuthUserContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.read(auth, id);
  }

  @Get('nav-counts')
  @ResponseMessage('Counts loaded.')
  @ApiOperation({
    summary: 'Counts beside sidebar items (setup steps left, tickets waiting on the school)',
  })
  navCounts() {
    return this.inbox.navCounts();
  }
}
