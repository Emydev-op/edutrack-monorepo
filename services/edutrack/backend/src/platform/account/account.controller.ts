import { Body, Controller, Get, HttpCode, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PlatformAlertsService } from '../alerts/platform-alerts.service.js';
import { AccountService } from './account.service.js';
import {
  AvatarDto,
  NotificationPreferenceDto,
  SecuritySettingsDto,
  UpdateProfileDto,
} from './dto/account.dto.js';
import { SearchService } from './search.service.js';

const me = () => {
  const id = RequestContext.get()?.userId;
  if (!id) throw AppException.unauthorized();
  return id;
};

@ApiTags('platform · account')
@Controller('platform/me')
export class MeController {
  constructor(private readonly account: AccountService) {}

  @Get('profile')
  @PlatformOnly()
  @ApiOperation({ summary: 'Your profile' })
  profile() {
    return this.account.profile();
  }

  @Patch('profile')
  @PlatformOnly()
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(dto);
  }

  @Put('avatar')
  @PlatformOnly()
  @ApiOperation({ summary: 'Upload (JPG or PNG, up to 2 MB, as a data URL) or remove your photo' })
  avatar(@Body() dto: AvatarDto) {
    return this.account.setAvatar(dto.avatarUrl);
  }
}

@ApiTags('platform · account')
@Controller('platform/settings')
export class SettingsController {
  constructor(
    private readonly account: AccountService,
    private readonly alerts: PlatformAlertsService,
  ) {}

  @Get('notifications')
  @PlatformOnly()
  @ApiOperation({ summary: 'Your notification channels per event' })
  notifications() {
    return this.alerts.preferences(me());
  }

  @Put('notifications')
  @PlatformOnly()
  @ApiOperation({ summary: 'Turn one channel on or off for one event (security emails stay on)' })
  setNotification(@Body() dto: NotificationPreferenceDto) {
    return this.alerts.setPreference(me(), dto);
  }

  @Get('security')
  @PlatformOnly('Settings.View')
  security() {
    return this.account.security();
  }

  @Put('security')
  @PlatformOnly('Settings.Edit')
  @ApiOperation({
    summary: 'Back-office sign-in security toggles',
    description: 'IP restriction can’t be turned on yet (IP_RANGES_REQUIRED).',
  })
  updateSecurity(@Body() dto: SecuritySettingsDto) {
    return this.account.updateSecurity(dto);
  }
}

@ApiTags('platform · account')
@Controller('platform/notifications')
export class NotificationsController {
  constructor(private readonly alerts: PlatformAlertsService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'Your latest 30 notifications' })
  list() {
    return this.alerts.inbox(me());
  }

  @Post('read-all')
  @HttpCode(200)
  @PlatformOnly()
  readAll() {
    return this.alerts.markAllRead(me());
  }
}

@ApiTags('platform · account')
@Controller('platform/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'Schools, staff and issues for the command menu' })
  @ApiQuery({ name: 'q', required: false })
  search(@Query('q') q?: string) {
    return this.searchService.search(typeof q === 'string' ? q : undefined);
  }
}
