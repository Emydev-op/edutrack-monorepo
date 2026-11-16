import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentTenant } from '../../common/decorators/request.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { UpdateSchoolProfileDto } from './dto/profile.dto.js';
import { SchoolProfileResponse } from './dto/profile.responses.js';
import { SchoolProfileService } from './profile.service.js';

@ApiTags('school · profile')
@Portals('SCHOOL_ADMIN')
@Controller('school/profile')
export class SchoolProfileController {
  constructor(private readonly profile: SchoolProfileService) {}

  @ResponseMessage('School profile loaded.')
  @Get()
  @RequirePermission('settings.profile')
  @ApiOperation({
    summary: 'The school’s details, plan and change history',
    description:
      'Legal name, ownership, sections and plan are set by EduTrack and only shown. The logo ' +
      'comes back as `logo.dataUrl`, a signed link valid for an hour.',
  })
  @ApiOkResponse({ type: SchoolProfileResponse })
  get(@CurrentTenant() schoolId: string) {
    return this.profile.get(schoolId);
  }

  @ResponseMessage('School details saved. Changes are live on all portals.')
  @Put()
  @RequirePermission('settings.profile')
  @ApiOperation({
    summary: 'Save the school’s details',
    description:
      'The whole form. `logo` and `certificate`: a `data:` URL uploads a new file (logo PNG or ' +
      'JPG up to 1 MB; certificate PDF, PNG or JPG up to 5 MB, checked by their bytes), null ' +
      'removes it, and the file as it was returned keeps it. `brandColor` is optional. The ' +
      'legal name can’t be changed here. Saving completes the Setup Center’s School Profile step.',
  })
  @ApiOkResponse({ type: SchoolProfileResponse })
  @ApiUnprocessableEntityResponse({
    description:
      'VALIDATION, LEGAL_NAME_LOCKED, LOGO_TYPE, LOGO_TOO_LARGE, CERTIFICATE_TYPE, CERTIFICATE_TOO_LARGE',
  })
  update(@CurrentTenant() schoolId: string, @Body() dto: UpdateSchoolProfileDto) {
    return this.profile.update(schoolId, dto);
  }
}
