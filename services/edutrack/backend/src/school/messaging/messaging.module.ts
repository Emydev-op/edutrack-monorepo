import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AuthModule } from '../../auth/auth.module.js';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { MemberPermissions } from '../students/member-permissions.js';
import { MAX_BODY, MAX_SUBJECT, MessagingService } from './messaging.service.js';

export class ReplyDto {
  @ApiProperty({ maxLength: MAX_BODY })
  @IsString({ message: 'Write a message.' })
  @MaxLength(MAX_BODY + 500)
  body!: string;
}

class StartBase extends ReplyDto {
  @ApiProperty({ maxLength: MAX_SUBJECT })
  @IsString({ message: 'Add a subject.' })
  @MaxLength(MAX_SUBJECT + 100)
  subject!: string;

  @ApiPropertyOptional({ description: 'The child it’s about' })
  @IsOptional()
  @IsString()
  studentId?: string | null;
}

export class ParentStartDto extends StartBase {
  @ApiProperty({ enum: ['school', 'teacher'] })
  @IsIn(['school', 'teacher'], { message: 'Choose who to write to.' })
  to!: 'school' | 'teacher';

  @ApiPropertyOptional({ description: 'The teacher, when writing to a teacher' })
  @IsOptional()
  @IsString()
  staffId?: string | null;
}

export class StaffStartDto extends StartBase {
  @ApiProperty({ description: 'The parent (guardian) to write to' })
  @IsString({ message: 'Choose a parent.' })
  guardianId!: string;
}

const LIST = 'Each conversation with the other side, the last message and unread count';
const THREAD = 'One conversation with its messages (opening it marks it read)';

/** Parent Portal › Messages: the parent's conversations with teachers and the school. */
@ApiTags('parent · messages')
@Portals('PARENT')
@Controller('parent/messages')
export class ParentMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @ResponseMessage('Messages loaded.')
  @Get()
  @ApiOperation({ summary: LIST })
  async list(@CurrentUser() auth: AuthUserContext) {
    return this.messaging.list(await this.messaging.parent(auth));
  }

  @ResponseMessage('Contacts loaded.')
  @Get('contacts')
  @ApiOperation({
    summary: 'Each child’s class teacher and subject teachers this term, and the school',
  })
  contacts(@CurrentUser() auth: AuthUserContext) {
    return this.messaging.parentContacts(auth);
  }

  @ResponseMessage('Message sent.')
  @Post()
  @ApiOperation({ summary: 'Write to the school, or to one of your child’s teachers' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  async start(@CurrentUser() auth: AuthUserContext, @Body() dto: ParentStartDto) {
    return this.messaging.start(await this.messaging.parent(auth), dto);
  }

  @ResponseMessage('Conversation loaded.')
  @Get(':id')
  @ApiOperation({ summary: THREAD })
  @ApiNotFoundResponse({ description: 'CONVERSATION_NOT_FOUND' })
  async thread(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.messaging.thread(await this.messaging.parent(auth), id);
  }

  @ResponseMessage('Message sent.')
  @Post(':id')
  @ApiOperation({ summary: 'Reply in a conversation' })
  async reply(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.messaging.reply(await this.messaging.parent(auth), id, dto.body);
  }
}

/** Teacher Workspace › Messages: the teacher's conversations with parents. */
@ApiTags('teacher · messages')
@Portals('TEACHER')
@Controller('messages')
export class TeacherMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @ResponseMessage('Messages loaded.')
  @Get()
  @ApiOperation({ summary: LIST })
  async list(@CurrentUser() auth: AuthUserContext) {
    return this.messaging.list(await this.messaging.teacher(auth));
  }

  @ResponseMessage('Contacts loaded.')
  @Get('contacts')
  @ApiOperation({ summary: 'The students the teacher teaches this term, with their parents' })
  contacts(@CurrentUser() auth: AuthUserContext) {
    return this.messaging.teacherContacts(auth);
  }

  @ResponseMessage('Message sent.')
  @Post()
  @ApiOperation({ summary: 'Write to a parent of a student you teach' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION' })
  async start(@CurrentUser() auth: AuthUserContext, @Body() dto: StaffStartDto) {
    return this.messaging.start(await this.messaging.teacher(auth), dto);
  }

  @ResponseMessage('Conversation loaded.')
  @Get(':id')
  @ApiOperation({ summary: THREAD })
  async thread(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.messaging.thread(await this.messaging.teacher(auth), id);
  }

  @ResponseMessage('Message sent.')
  @Post(':id')
  @ApiOperation({ summary: 'Reply in a conversation' })
  async reply(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.messaging.reply(await this.messaging.teacher(auth), id, dto.body);
  }
}

/** School Admin › Communication › Messages: the school office's shared inbox with parents. */
@ApiTags('school · messages')
@Portals('SCHOOL_ADMIN')
@Controller('comms/messages')
export class OfficeMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @ResponseMessage('Messages loaded.')
  @Get()
  @RequirePermission('comms.view')
  @ApiOperation({ summary: `${LIST} (conversations with the school only)` })
  @ApiForbiddenResponse({ description: 'Without school-wide messaging (comms.school)' })
  async list(@CurrentUser() auth: AuthUserContext) {
    return this.messaging.list(await this.messaging.office(auth));
  }

  @ResponseMessage('Parents found.')
  @Get('contacts')
  @RequirePermission('comms.view')
  @ApiOperation({
    summary: 'Parents matching a name, email, phone, or a child’s name (2+ letters)',
  })
  contacts(@CurrentUser() auth: AuthUserContext, @Query('q') q?: string) {
    return this.messaging.officeContacts(auth, q ?? '');
  }

  @ResponseMessage('Message sent.')
  @Post()
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'Write to a parent as the school' })
  async start(@CurrentUser() auth: AuthUserContext, @Body() dto: StaffStartDto) {
    return this.messaging.start(await this.messaging.office(auth), dto);
  }

  @ResponseMessage('Conversation loaded.')
  @Get(':id')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: THREAD })
  async thread(@CurrentUser() auth: AuthUserContext, @Param('id') id: string) {
    return this.messaging.thread(await this.messaging.office(auth), id);
  }

  @ResponseMessage('Message sent.')
  @Post(':id')
  @RequirePermission('comms.view')
  @ApiOperation({ summary: 'Reply as the school' })
  async reply(
    @CurrentUser() auth: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.messaging.reply(await this.messaging.office(auth), id, dto.body);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ParentMessagesController, TeacherMessagesController, OfficeMessagesController],
  providers: [MessagingService, MemberPermissions],
})
export class MessagingModule {}
