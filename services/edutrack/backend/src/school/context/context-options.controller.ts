import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { ContextOptionsService } from './context-options.service.js';
import { ContextOptionsResponse } from './dto/context-options.responses.js';

@ApiTags('school · shell')
@Portals('SCHOOL_ADMIN')
@Controller('context-options')
export class ContextOptionsController {
  constructor(private readonly context: ContextOptionsService) {}

  @ResponseMessage('Context options loaded.')
  @Get()
  @RequirePermission()
  @ApiOperation({
    summary: 'The header’s branch, session and term choices',
    description:
      'Active branches (with “All branches” when there are several), the non-archived sessions ' +
      'and the current session’s terms, with where a new sign-in starts.',
  })
  @ApiOkResponse({ type: ContextOptionsResponse })
  options() {
    return this.context.options();
  }
}
