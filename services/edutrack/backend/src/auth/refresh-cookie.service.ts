import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.validation.js';
import type { Portal } from '../generated/prisma/enums.js';

/** Sent with refresh and logout only: the cookie never travels with ordinary API calls. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * One cookie per portal (`et_rt_school_admin`, `et_rt_teacher`, `et_rt_platform`) so portals on
 * the same host (localhost:517x in development) don't sign each other out.
 */
export const refreshCookieName = (portal: Portal) => `et_rt_${portal.toLowerCase()}`;

/**
 * The refresh-token cookie: HttpOnly (scripts can't read it), Secure outside local HTTP,
 * SameSite=Lax, scoped to the auth routes. "Keep me signed in" makes it persistent; otherwise it
 * is a browser-session cookie (the server still ends the session after REFRESH_TTL_SESSION_HOURS).
 */
@Injectable()
export class RefreshCookieService {
  private readonly secure: boolean;
  private readonly domain?: string;

  constructor(config: ConfigService<Env, true>) {
    this.secure = config.get('COOKIE_SECURE', { infer: true }) ?? true;
    this.domain = config.get('COOKIE_DOMAIN', { infer: true }) || undefined;
  }

  private base(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      ...(this.domain && { domain: this.domain }),
    };
  }

  set(res: Response, portal: Portal, token: string, persistentForMs: number | null) {
    res.cookie(refreshCookieName(portal), token, {
      ...this.base(),
      ...(persistentForMs !== null && { maxAge: persistentForMs }),
    });
  }

  clear(res: Response, portal: Portal) {
    res.clearCookie(refreshCookieName(portal), this.base());
  }

  read(req: Request, portal: Portal): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[refreshCookieName(portal)];
    return typeof value === 'string' && value.length > 0 && value.length < 200 ? value : undefined;
  }
}
