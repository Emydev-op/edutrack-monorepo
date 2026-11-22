import { SchoolWide } from '../../common/plan/branch-scope.js';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import { PositionDto } from './dto/organogram.dto.js';
import {
  OrganogramResponseDto,
  PositionRemovedDto,
  PositionResponseDto,
} from './dto/organogram.responses.js';
import { OrganogramService } from './organogram.service.js';

@ApiTags('school · organogram')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('organogram')
export class OrganogramController {
  constructor(private readonly organogram: OrganogramService) {}

  @ResponseMessage('Organogram loaded.')
  @Get()
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Every position with its holders, and the organogram’s history' })
  @ApiOkResponse({ type: OrganogramResponseDto })
  chart() {
    return this.organogram.chart();
  }

  @ResponseMessage('Position added.')
  @Post('positions')
  @RequirePermission('settings.roles')
  @ApiOperation({
    summary: 'Add a position',
    description:
      'Titles are unique; only one position is at the top (no parent); holders are current ' +
      'staff; suggested roles are role names.',
  })
  @ApiOkResponse({ type: PositionResponseDto })
  create(@Body() dto: PositionDto) {
    return this.organogram.create(dto);
  }

  @ResponseMessage('Position saved.')
  @Patch('positions/:id')
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Edit a position (it can’t report to itself or one of its reports)' })
  @ApiOkResponse({ type: PositionResponseDto })
  @ApiNotFoundResponse({ description: 'This position doesn’t exist.' })
  update(@Param('id') id: string, @Body() dto: PositionDto) {
    return this.organogram.update(id, dto);
  }

  @ResponseMessage('Position removed.')
  @Delete('positions/:id')
  @HttpCode(200)
  @RequirePermission('settings.roles')
  @ApiOperation({ summary: 'Remove a position nobody reports to (not the top one)' })
  @ApiOkResponse({ type: PositionRemovedDto })
  @ApiNotFoundResponse({ description: 'This position doesn’t exist.' })
  @ApiConflictResponse({ description: 'TOP_POSITION, POSITION_HAS_REPORTS' })
  remove(@Param('id') id: string) {
    return this.organogram.remove(id);
  }
}
