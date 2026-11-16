import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.validation.js';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CredentialsService } from './credentials.service.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { InvitationService } from './invitation.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalLinksService } from './portal-links.service.js';
import { RefreshCookieService } from './refresh-cookie.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AuthService,
    CredentialsService,
    InvitationService,
    PasswordResetService,
    PortalAccessService,
    PortalLinksService,
    RateLimitService,
    RefreshCookieService,
    SessionService,
    // Order matters: authenticate first, then check permissions.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [
    AccessTokenService,
    AuthService,
    InvitationService,
    PasswordResetService,
    PortalAccessService,
    PortalLinksService,
    RateLimitService,
    SessionService,
  ],
})
export class AuthModule {}
