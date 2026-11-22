import { SchoolWide } from '../../common/plan/branch-scope.js';
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { SetupProgressResponse, SetupStepResponse } from './dto/setup.responses.js';
import { SetupService, type SetupStepView } from './setup.service.js';

@ApiTags('school · setup')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @ResponseMessage('Setup progress loaded.')
  @Get()
  @RequirePermission()
  @ApiOperation({
    summary: 'The Setup Center: every step, and whether the foundation is in place',
    description:
      'Any School Admin member may read it: the portal checks `foundationComplete` on every ' +
      'navigation and keeps admins in the Setup Center until it is true.',
  })
  @ApiOkResponse({ type: SetupProgressResponse })
  progress() {
    return this.setup.view();
  }

  @ResponseMessage((s: SetupStepView) => `${s.name} marked as done.`)
  @Post('steps/:id/complete')
  @HttpCode(200)
  @RequirePermission()
  @ApiOperation({
    summary: 'Mark a step complete',
    description:
      'Steps backed by built screens check the school’s data first and answer 422 with what is ' +
      'missing. Needs the step’s own permission (`academics.configure` for the academic steps, ' +
      '`settings.*` for the School steps, `settings.profile` for steps of modules still to come).',
  })
  @ApiOkResponse({ type: SetupStepResponse })
  @ApiNotFoundResponse({ description: 'SETUP_STEP_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SAVE_PROFILE_TO_COMPLETE' })
  @ApiUnprocessableEntityResponse({ description: 'SETUP_STEP_BLOCKED' })
  complete(@Param('id') id: string) {
    return this.setup.complete(id);
  }

  @ResponseMessage('Setup complete. Reopen the Setup Center from the dashboard any time.')
  @Post('finish')
  @HttpCode(200)
  @RequirePermission('settings.profile')
  @ApiOperation({ summary: 'Mark setup complete once every required step is done' })
  @ApiOkResponse({ type: SetupProgressResponse })
  @ApiConflictResponse({ description: 'SETUP_STEPS_LEFT' })
  finish() {
    return this.setup.finish();
  }
}
