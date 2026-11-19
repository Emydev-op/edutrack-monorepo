import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiBody, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals, OpenWhenLapsed } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { TeacherFrameService } from '../teacher/teacher-frame.service.js';
import { SchoolInboxService } from './school-inbox.service.js';

class InboxQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'unread'] })
  @IsOptional()
  @IsIn(['all', 'unread'], { message: 'Unknown filter.' })
  filter?: 'all' | 'unread';
}

class TermQuery {
  @ApiPropertyOptional({ description: 'Teacher Workspace: the selected term' })
  @IsOptional()
  @IsString()
  term?: string;
}

/**
 * The header bell, notifications and sidebar counts of School Admin and the Teacher Workspace.
 * Both portals call the same paths; each gets the shape its screens use.
 */
@ApiTags('school inbox')
@Portals('SCHOOL_ADMIN', 'TEACHER')
@OpenWhenLapsed()
@Controller()
export class SchoolInboxController {
  constructor(
    private readonly inbox: SchoolInboxService,
    private readonly modules: ModuleRef,
  ) {}

  /** The Teacher Workspace's side (its module is resolved lazily: it imports this one's). */
  private teacher() {
    return this.modules.get(TeacherFrameService, { strict: false });
  }

  @Get('notifications')
  @ResponseMessage('Notifications loaded.')
  @ApiOperation({
    summary:
      'School Admin: the latest 20 notifications. Teacher Workspace: notifications, paged, with counts',
  })
  latest(@CurrentUser() auth: AuthUserContext, @Query() q: InboxQuery) {
    return auth.portal === 'TEACHER'
      ? this.teacher().notifications(auth, q)
      : this.inbox.latest(auth);
  }

  @Get('notifications/preferences')
  @ResponseMessage('Email preferences loaded.')
  @Portals('TEACHER')
  @ApiOperation({ summary: 'Teacher Workspace: which notifications also come by email' })
  preferences(@CurrentUser() auth: AuthUserContext) {
    return this.teacher().preferences(auth);
  }

  @Put('notifications/preferences')
  @ResponseMessage('Email preferences saved.')
  @Portals('TEACHER')
  @ApiOperation({ summary: 'Teacher Workspace: switch emails on or off, by event key' })
  @ApiBody({
    schema: { type: 'object', additionalProperties: { type: 'boolean' } },
    description: 'Event key → email on/off, e.g. { "sheet-returned": false }',
  })
  savePreferences(@CurrentUser() auth: AuthUserContext, @Body() body: Record<string, unknown>) {
    return this.teacher().savePreferences(auth, body);
  }

  @Get('comms/inbox')
  @Portals('SCHOOL_ADMIN')
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
    return auth.portal === 'TEACHER' ? this.teacher().readAll(auth) : this.inbox.readAll(auth);
  }

  @Post('notifications/:id/read')
  @ResponseMessage('Notification marked read.')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one notification read' })
  read(@CurrentUser() auth: AuthUserContext, @Param('id', ParseUUIDPipe) id: string) {
    return auth.portal === 'TEACHER' ? this.teacher().read(auth, id) : this.inbox.read(auth, id);
  }

  @Get('nav-counts')
  @ResponseMessage('Counts loaded.')
  @ApiOperation({
    summary: 'Counts beside sidebar items (setup steps left, tickets waiting on the school)',
  })
  navCounts(@CurrentUser() auth: AuthUserContext, @Query() q: TermQuery) {
    return auth.portal === 'TEACHER'
      ? this.teacher().navCounts(auth, q.term)
      : this.inbox.navCounts();
  }
}
