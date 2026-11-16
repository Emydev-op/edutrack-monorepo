import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import {
  DashboardService,
  GROWTH_RANGES,
  REVENUE_RANGES,
  type GrowthRange,
  type RevenueRange,
} from './dashboard.service.js';
import { ResponseMessage } from '../../common/http/api-response.js';

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

@ApiTags('platform · dashboard')
@Controller('platform/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @ResponseMessage('Dashboard loaded.')
  @Get('summary')
  @PlatformOnly()
  @ApiOperation({ summary: 'Greeting and platform totals' })
  summary(@CurrentUser() user: AuthUserContext) {
    return this.dashboard.summary(user.userId);
  }

  @ResponseMessage('Revenue loaded.')
  @Get('revenue')
  @PlatformOnly('Reports.View')
  @ApiQuery({ name: 'range', enum: REVENUE_RANGES, required: false })
  @ApiOperation({ summary: 'Paid revenue by source (₦ millions) against the previous period' })
  revenue(@Query('range') range?: string) {
    return this.dashboard.revenue(pick<RevenueRange>(REVENUE_RANGES, range, '30d'));
  }

  @ResponseMessage('Growth loaded.')
  @Get('growth')
  @PlatformOnly('Reports.View')
  @ApiQuery({ name: 'range', enum: GROWTH_RANGES, required: false })
  @ApiOperation({ summary: 'Schools onboarded, active, suspended and expired per month' })
  growth(@Query('range') range?: string) {
    return this.dashboard.growth(pick<GrowthRange>(GROWTH_RANGES, range, '6m'));
  }

  @ResponseMessage('Subscription health loaded.')
  @Get('subscription-health')
  @PlatformOnly('Subscriptions.View')
  @ApiOperation({ summary: 'Subscriptions by status' })
  subscriptionHealth() {
    return this.dashboard.subscriptionHealth();
  }

  @ResponseMessage('Items needing attention loaded.')
  @Get('attention')
  @PlatformOnly()
  @ApiOperation({
    summary: 'Lapsed renewals, urgent support, stalled onboarding, pending invitations',
  })
  attention() {
    return this.dashboard.attention();
  }

  @ResponseMessage('Onboarding schools loaded.')
  @Get('onboarding')
  @PlatformOnly('Schools.View')
  @ApiOperation({ summary: 'Schools still setting up' })
  onboarding() {
    return this.dashboard.onboarding();
  }
}
