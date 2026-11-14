import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { SubscriptionListQuery } from './dto/subscriptions.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';

@ApiTags('platform · subscriptions')
@Controller('platform/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @PlatformOnly('Subscriptions.View')
  @ApiOperation({
    summary: 'Subscriptions of schools that aren’t suspended, soonest renewal first',
  })
  list(@Query() query: SubscriptionListQuery) {
    return this.subscriptions.list(query);
  }
}
