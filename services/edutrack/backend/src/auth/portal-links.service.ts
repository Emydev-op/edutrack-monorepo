import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { Portal } from '../generated/prisma/enums.js';

/** Builds the links that go into emails and SMS, pointing at each portal's own pages. */
@Injectable()
export class PortalLinksService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  base(portal: Portal, schoolSlug?: string | null): string {
    switch (portal) {
      case Portal.PLATFORM:
        return this.config.get('PLATFORM_PORTAL_URL', { infer: true }).replace(/\/$/, '');
      case Portal.SCHOOL_ADMIN:
        return this.config.get('SCHOOL_ADMIN_PORTAL_URL', { infer: true }).replace(/\/$/, '');
      default:
        return this.config
          .get('TEACHER_PORTAL_URL_TEMPLATE', { infer: true })
          .replace('{slug}', schoolSlug ?? '')
          .replace(/\/$/, '');
    }
  }

  /** `<portal>/reset-password?token=…` (the portals' ResetPasswordView reads `?token`). */
  resetPassword(portal: Portal, schoolSlug: string | null | undefined, token: string) {
    return `${this.base(portal, schoolSlug)}/reset-password?token=${encodeURIComponent(token)}`;
  }

  /** `<portal>/accept-invitation/:token`. */
  acceptInvitation(portal: Portal, schoolSlug: string | null | undefined, token: string) {
    return `${this.base(portal, schoolSlug)}/accept-invitation/${encodeURIComponent(token)}`;
  }
}
