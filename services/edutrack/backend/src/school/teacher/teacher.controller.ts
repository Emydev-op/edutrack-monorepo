import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { SaveRegisterDto } from './dto/register.dto.js';
import { RegisterService } from './register.service.js';
import { TeacherFrameService } from './teacher-frame.service.js';
import { TeachingService } from './teaching.service.js';

const termQuery = ApiQuery({
  name: 'term',
  required: false,
  description: 'Term id; the active term when omitted. Past terms are read-only.',
});

/**
 * Teacher Workspace (`<slug>.edutrack.ng/teacher`): the frame, Teaching (my classes, subjects,
 * students, timetable, lessons) and My class › Register. Every answer is scoped to the signed-in
 * teacher: their assignments, and their class when they're a class teacher. Results, homework
 * (assignments and materials) and lesson notes have their own modules. `GET /v1/dashboard` and `GET /v1/search` are served
 * with School Admin's by `SchoolFrameController` (insights), on the same paths.
 */
@ApiTags('teacher workspace')
@Portals('TEACHER')
@Controller()
export class TeacherController {
  constructor(
    private readonly teaching: TeachingService,
    private readonly register: RegisterService,
    private readonly frame: TeacherFrameService,
  ) {}

  /* ---------------- Frame ---------------- */

  @ResponseMessage('Profile loaded.')
  @Get('profile')
  @ApiOperation({ summary: 'The teacher’s own staff record, classes and roles' })
  profile(@CurrentUser() auth: AuthUserContext) {
    return this.frame.profile(auth);
  }

  @ResponseMessage('Profile saved.')
  @Put('profile')
  @ApiOperation({
    summary: 'Change my phone, address and emergency contact',
    description: 'Name, email, staff number and roles are kept by the school office.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', example: '0803 412 7781' },
        address: { type: 'string' },
        emergencyContact: {
          type: 'object',
          nullable: true,
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            relationship: { type: 'string' },
          },
        },
      },
    },
  })
  saveProfile(
    @CurrentUser() auth: AuthUserContext,
    @Body()
    body: {
      phone?: string;
      address?: string;
      emergencyContact?: { name?: string; phone?: string; relationship?: string } | null;
    },
  ) {
    return this.frame.saveProfile(auth, body);
  }

  @ResponseMessage('Profile loaded.')
  @Get('me')
  @ApiOperation({
    summary: 'The teacher and what their roles unlock (class teacher, HOD, Academic Head)',
  })
  @ApiForbiddenResponse({ description: 'NO_ACCESS: not an active teacher at this school' })
  me(@CurrentUser() auth: AuthUserContext) {
    return this.teaching.me(auth);
  }

  @ResponseMessage('Context loaded.')
  @Get('context')
  @ApiOperation({ summary: 'The school’s terms, the active one, the clock and the term calendar' })
  context() {
    return this.teaching.context();
  }

  @ResponseMessage('Scope loaded.')
  @Get('my-scope')
  @termQuery
  @ApiOperation({ summary: 'My teaching assignments and my class for a term' })
  myScope(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.teaching.myScope(auth, term);
  }

  /* ---------------- Teaching ---------------- */

  @ResponseMessage('Classes loaded.')
  @Get('teaching/classes')
  @termQuery
  @ApiOperation({ summary: 'My classes (one card per class arm and subject)' })
  classes(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.teaching.classes(auth, term);
  }

  @ResponseMessage('Class loaded.')
  @Get('teaching/classes/:armId/:subject')
  @termQuery
  @ApiOperation({ summary: 'One of my classes: students, class teacher, department, next lesson' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not my class this term' })
  classDetail(
    @CurrentUser() auth: AuthUserContext,
    @Param('armId') armId: string,
    @Param('subject') subject: string,
    @Query('term') term?: string,
  ) {
    return this.teaching.classDetail(auth, armId, subject, term);
  }

  @ResponseMessage('Subjects loaded.')
  @Get('teaching/subjects')
  @termQuery
  @ApiOperation({ summary: 'My subjects with their classes' })
  subjects(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.teaching.subjects(auth, term);
  }

  @ResponseMessage('Subject loaded.')
  @Get('teaching/subjects/:code')
  @termQuery
  @ApiOperation({ summary: 'One of my subjects, with the assessment scheme of each section' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not my subject this term' })
  subjectDetail(
    @CurrentUser() auth: AuthUserContext,
    @Param('code') code: string,
    @Query('term') term?: string,
  ) {
    return this.teaching.subjectDetail(auth, code, term);
  }

  @ResponseMessage('Students loaded.')
  @Get('teaching/students')
  @termQuery
  @ApiQuery({ name: 'class', required: false, description: 'Class arm id' })
  @ApiQuery({ name: 'subject', required: false, description: 'Subject code' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOperation({ summary: 'Everyone I teach this term, once each with my subjects for them' })
  students(
    @CurrentUser() auth: AuthUserContext,
    @Query()
    q: {
      term?: string;
      class?: string;
      subject?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.teaching.students(auth, {
      ...q,
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 20,
    });
  }

  @ResponseMessage('Student loaded.')
  @Get('teaching/students/:studentId')
  @termQuery
  @ApiOperation({ summary: 'A student I teach (or in my class): class, my subjects, attendance' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not a student I teach' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  student(
    @CurrentUser() auth: AuthUserContext,
    @Param('studentId') id: string,
    @Query('term') term?: string,
  ) {
    return this.teaching.studentDetail(auth, id, term);
  }

  @ResponseMessage('Timetable loaded.')
  @Get('teaching/timetable')
  @termQuery
  @ApiOperation({ summary: 'My week from the published class timetables, and today’s lessons' })
  timetable(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.teaching.timetable(auth, term);
  }

  @ResponseMessage('Lesson loaded.')
  @Get('teaching/lessons/:lessonId')
  @termQuery
  @ApiOperation({ summary: 'One lesson on my timetable and when it next happens' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: not on my timetable' })
  lesson(
    @CurrentUser() auth: AuthUserContext,
    @Param('lessonId') id: string,
    @Query('term') term?: string,
  ) {
    return this.teaching.lesson(auth, id, term);
  }

  /* ---------------- My class › Register ---------------- */

  @ResponseMessage('Register loaded.')
  @Get('class-teacher/register/history')
  @termQuery
  @ApiOperation({ summary: 'My class’s registers this term, per day and per student' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not a class teacher this term' })
  history(@CurrentUser() auth: AuthUserContext, @Query('term') term?: string) {
    return this.register.history(auth, term);
  }

  @ResponseMessage('Register loaded.')
  @Get('class-teacher/register')
  @termQuery
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD; today when omitted' })
  @ApiOperation({ summary: 'One day’s register for my class, and whether it can be changed' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: not a class teacher this term' })
  getRegister(
    @CurrentUser() auth: AuthUserContext,
    @Query('term') term?: string,
    @Query('date') date?: string,
  ) {
    return this.register.get(auth, term, date);
  }

  @ResponseMessage((r: { notified: string[] }) =>
    r.notified.length
      ? `Register saved. ${r.notified.length === 1 ? 'A parent was' : 'Parents were'} notified of ${r.notified.join(', ')}’s absence in the Parent Portal.`
      : 'Register saved.',
  )
  @Put('class-teacher/register/:date')
  @termQuery
  @ApiOperation({
    summary: 'Take or correct a day’s register',
    description:
      'Every student on the roll needs a mark; Excused needs a reason. Allowed for today and the ' +
      'previous school days within the school’s edit window (default 5). A student newly marked ' +
      'Absent gets their guardians an in-app Parent Portal notification.',
  })
  @ApiConflictResponse({
    description:
      'REGISTER_NO_SCHOOL · REGISTER_FUTURE · REGISTER_OUT_OF_TERM · REGISTER_TOO_OLD · TERM_LOCKED',
  })
  saveRegister(
    @CurrentUser() auth: AuthUserContext,
    @Param('date') date: string,
    @Body() dto: SaveRegisterDto,
    @Query('term') term?: string,
  ) {
    return this.register.save(auth, date, dto, term);
  }
}
