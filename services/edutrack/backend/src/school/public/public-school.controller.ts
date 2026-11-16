import { Controller, Get } from '@nestjs/common';
import {
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { PublicSchool } from '@edutrack/shared';
import { Public } from '../../auth/decorators/auth.decorators.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { SchoolBrandingService } from '../shared/school-branding.service.js';
import { PublicSchoolDto } from './public-school.dto.js';

@ApiTags('public · school')
@Controller('public')
export class PublicSchoolController {
  constructor(private readonly branding: SchoolBrandingService) {}

  @Public()
  @ResponseMessage((s: PublicSchool) => `${s.name} found.`)
  @Get('school')
  @ApiOperation({
    summary: 'The school at this address',
    description:
      'Read by the school entry page and the teacher, parent and student sign-in pages to show ' +
      'the school’s name, logo and colour before anyone signs in. The school comes from the ' +
      'address: `greenfield.edutrack.ng` (or `greenfield.localhost` locally). From curl or ' +
      'Postman set the `Host` header, e.g. `Host: greenfield.localhost`. Public details only.',
  })
  @ApiHeader({
    name: 'Host',
    required: false,
    description: 'The school address, e.g. `greenfield.localhost` locally.',
  })
  @ApiOkResponse({ type: PublicSchoolDto })
  @ApiNotFoundResponse({ description: 'SCHOOL_NOT_FOUND: no school uses this address.' })
  async school(): Promise<PublicSchool> {
    const host = RequestContext.get()?.hostSchool;
    const school = host ? await this.branding.publicSchool(host.id) : null;
    if (!school)
      throw AppException.notFound(
        'We couldn’t find a school at this address. Check the link your school sent you.',
        'SCHOOL_NOT_FOUND',
      );
    return school;
  }
}
