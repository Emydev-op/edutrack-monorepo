import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { planId } from '../shared/params.js';
import { CreatePlanDto, PlanDefinitionDto, PlanStatusDto } from './dto/plans.dto.js';
import { PlansService } from './plans.service.js';

@ApiTags('platform · plans')
@Controller('platform/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @PlatformOnly('Subscriptions.View')
  @ApiOperation({ summary: 'Every plan with its school count and version history' })
  list() {
    return this.plans.list();
  }

  @Get(':id')
  @PlatformOnly('Subscriptions.View')
  @ApiOperation({ summary: 'One plan' })
  get(@Param('id', planId) id: string) {
    return this.plans.get(id);
  }

  @Get(':id/schools')
  @PlatformOnly('Subscriptions.View')
  @ApiOperation({ summary: 'Schools on the plan with their student and branch counts' })
  schools(@Param('id', planId) id: string) {
    return this.plans.schools(id);
  }

  @Post()
  @PlatformOnly('Subscriptions.Manage')
  @ApiOperation({ summary: 'Create a plan (published or draft)' })
  @ApiConflictResponse({ description: 'PLAN_NAME_TAKEN' })
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUserContext) {
    return this.plans.create(dto, user.userId);
  }

  @Patch(':id')
  @PlatformOnly('Subscriptions.Manage')
  @ApiOperation({
    summary: 'Edit a plan',
    description:
      'Saves a new version with a summary of what changed. Schools keep the version they were ' +
      'sold on. No changes, no new version.',
  })
  @ApiConflictResponse({ description: 'PLAN_NAME_TAKEN · PLAN_CHANGED' })
  update(
    @Param('id', planId) id: string,
    @Body() dto: PlanDefinitionDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.plans.update(id, dto, user.userId);
  }

  @Post(':id/status')
  @HttpCode(200)
  @PlatformOnly('Subscriptions.Manage')
  @ApiOperation({ summary: 'Publish, restore or archive a plan' })
  setStatus(@Param('id', planId) id: string, @Body() dto: PlanStatusDto) {
    return this.plans.setStatus(id, dto);
  }

  @Delete(':id')
  @PlatformOnly('Subscriptions.Manage')
  @ApiOperation({ summary: 'Delete a draft no school uses' })
  @ApiConflictResponse({ description: 'PLAN_IN_USE' })
  remove(@Param('id', planId) id: string) {
    return this.plans.remove(id);
  }
}
