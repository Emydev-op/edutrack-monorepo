import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Clock, DAY } from '../common/clock/clock.js';
import { PLATFORM_SECURITY_KEY, readPlatformSecurity } from '../common/platform-settings.js';
import { AppException } from '../common/errors/app.exception.js';
import type { AuthSession, User } from '../generated/prisma/client.js';
import { Portal } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessTokenService, type AccessClaims } from './access-token.service.js';
import type { AuthUserContext, ClientInfo } from './auth-context.js';
import {
  membershipView,
  platformPermissions,
  platformUser,
  schoolAdminUser,
  schoolChoices,
  schoolSummary,
  signedInBody,
  teacherUser,
} from './auth.presenter.js';
import { CredentialsService } from './credentials.service.js';
import type { ExpiredPasswordDto, LoginDto, PortalName } from './dto/auth.dto.js';
import { hashPassword, meetsPasswordPolicy, PASSWORD_POLICY_MESSAGE } from './password.js';
import { HOST_PORTALS, PortalAccessService, type PortalAccess } from './portal-access.service.js';
import { SessionService } from './session.service.js';

export interface SignedIn {
  body: ReturnType<typeof signedInBody>;
  session: AuthSession;
  refreshToken: string;
}

const PORTAL_BY_NAME: Record<PortalName, Portal> = {
  school_admin: Portal.SCHOOL_ADMIN,
  teacher: Portal.TEACHER,
  parent: Portal.PARENT,
  student: Portal.STUDENT,
  platform: Portal.PLATFORM,
};

const PORTAL_TITLES: Record<Portal, string> = {
  PLATFORM: 'the EduTrack back office',
  SCHOOL_ADMIN: 'School Admin',
  TEACHER: 'the Teacher Workspace',
  PARENT: 'the Parent Portal',
  STUDENT: 'the Student Portal',
};

export const portalName = (portal: Portal) => portal.toLowerCase() as PortalName;

/**
 * Sign-in, refresh, sign-out and the signed-in user's view of themselves. Sessions and refresh
 * tokens live in `SessionService`; credential checks and lockout in `CredentialsService`; who may
 * use which portal in `PortalAccessService`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly credentials: CredentialsService,
    private readonly access: PortalAccessService,
    private readonly sessions: SessionService,
    private readonly tokens: AccessTokenService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The portal a call is for: explicit (body or X-EduTrack-Portal), else Teacher Workspace on a
   * school's subdomain and School Admin elsewhere.
   */
  resolvePortal(name: string | undefined, client: ClientInfo): Portal {
    const key = name?.trim().toLowerCase() as PortalName | undefined;
    if (key) {
      const portal = PORTAL_BY_NAME[key];
      if (!portal) throw AppException.validation({ portal: 'Unknown portal.' });
      return portal;
    }
    return client.hostSchool || client.unknownHostSlug ? Portal.TEACHER : Portal.SCHOOL_ADMIN;
  }

  /** Portals on a school subdomain need that school; returns its id (undefined for the others). */
  hostSchoolFor(portal: Portal, client: ClientInfo): string | undefined {
    if (!HOST_PORTALS.has(portal)) return undefined;
    if (client.hostSchool) return client.hostSchool.id;
    if (client.unknownHostSlug)
      throw AppException.notFound('We couldn’t find this school on EduTrack.', 'SCHOOL_NOT_FOUND');
    throw AppException.badRequest(
      'Open your school’s EduTrack address (for example greenfield.edutrack.ng) to sign in.',
      'TENANT_REQUIRED',
    );
  }

  /** @param portalHeader the X-EduTrack-Portal header, used when the body names no portal. */
  async login(dto: LoginDto, client: ClientInfo, portalHeader?: string): Promise<SignedIn> {
    const portal = this.resolvePortal(dto.portal ?? portalHeader, client);
    const hostSchoolId = this.hostSchoolFor(portal, client);
    const raw = (dto.email ?? dto.identifier ?? '').trim();
    const { user } = await this.credentials.verify(
      raw,
      dto.password,
      portal,
      hostSchoolId ?? dto.schoolId,
    );
    const access = await this.authorize(user, portal, hostSchoolId ?? dto.schoolId);
    if (this.access.isPasswordExpired(user, access))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Your password has expired.',
        'PASSWORD_EXPIRED',
      );
    return this.startSession(user, access, dto.remember ?? false, client);
  }

  /** "Your password has expired": checks the old password, sets the new one and signs in. */
  async signInWithExpiredPassword(
    dto: ExpiredPasswordDto,
    client: ClientInfo,
    portalHeader?: string,
  ): Promise<SignedIn> {
    const portal = this.resolvePortal(dto.portal ?? portalHeader, client);
    const hostSchoolId = this.hostSchoolFor(portal, client);
    const { user } = await this.credentials.verify(
      dto.email,
      dto.current,
      portal,
      hostSchoolId ?? dto.schoolId,
    );
    const access = await this.authorize(user, portal, hostSchoolId ?? dto.schoolId);
    if (!this.access.isPasswordExpired(user, access))
      throw AppException.conflict('Your password hasn’t expired.', 'PASSWORD_NOT_EXPIRED');
    if (!meetsPasswordPolicy(dto.next))
      throw AppException.validation({ next: PASSWORD_POLICY_MESSAGE });
    if (dto.next === dto.current)
      throw AppException.validation({ next: 'Choose a password you haven’t used before.' });

    const now = this.clock.now();
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(dto.next),
        passwordChangedAt: now,
        mustChangePassword: false,
      },
    });
    await this.sessions.revokeAllForUser(user.id, 'password_changed');
    await this.notifyPasswordChanged(updated, 'changed after it expired');
    return this.startSession(updated, access, dto.remember ?? false, client);
  }

  /** Account-wide blocks first, then the portal's own access rules. */
  private async authorize(user: User, portal: Portal, schoolId?: string): Promise<PortalAccess> {
    if (user.status === 'SUSPENDED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'This account is suspended.',
        'ACCOUNT_SUSPENDED',
      );
    if (user.status === 'DEACTIVATED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'This account is no longer active.',
        'ACCOUNT_DEACTIVATED',
      );
    return this.access.resolve(user.id, portal, { schoolId });
  }

  private claimsFor(user: User, session: AuthSession, access: PortalAccess): AccessClaims {
    return {
      sub: user.id,
      sessionId: session.id,
      portal: session.portal,
      ...(access.portal !== 'PLATFORM' && {
        schoolId: access.membership.schoolId,
        membershipId: access.membership.id,
      }),
    };
  }

  private async startSession(
    user: User,
    access: PortalAccess,
    rememberMe: boolean,
    client: ClientInfo,
  ): Promise<SignedIn> {
    const now = this.clock.now();
    const { session, refreshToken } = await this.sessions.create({
      userId: user.id,
      portal: access.portal,
      schoolId: access.portal === 'PLATFORM' ? null : access.membership.schoolId,
      rememberMe,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const token = this.tokens.sign(this.claimsFor(user, session, access));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSignInAt: now, lastSeenAt: now },
    });
    if (access.portal === 'PLATFORM')
      await this.prisma.platformStaff.update({
        where: { id: access.staff.id },
        data: { lastActiveAt: now },
      });
    else
      await this.prisma.schoolMembership.update({
        where: { id: access.membership.id },
        data: { lastActiveAt: now },
      });
    await this.alertNewDevice(user, session, access).catch((error: unknown) =>
      this.logger.warn({ msg: 'New sign-in alert not queued', error: String(error) }),
    );
    return { body: signedInBody(user, access, token), session, refreshToken };
  }

  /** Emails the user when they sign in from a device not seen in the last 90 days. */
  private async alertNewDevice(user: User, session: AuthSession, access: PortalAccess) {
    if (!user.email) return;
    if (access.portal === 'PLATFORM') {
      if (!access.staff.newDeviceAlerts) return;
      const setting = await this.prisma.platformSetting.findUnique({
        where: { key: PLATFORM_SECURITY_KEY },
      });
      if (!readPlatformSecurity(setting?.value).newDeviceAlerts) return;
    }
    const since = new Date(this.clock.nowMs() - 90 * DAY);
    const previous = await this.prisma.authSession.findMany({
      where: { userId: user.id, id: { not: session.id }, createdAt: { gte: since } },
      select: { deviceLabel: true },
      distinct: ['deviceLabel'],
    });
    if (previous.length === 0 || previous.some((p) => p.deviceLabel === session.deviceLabel))
      return;
    await this.notifications.email(user.email, 'new-sign-in', {
      firstName: user.firstName,
      device: session.deviceLabel ?? 'Unknown device',
      when: formatWhen(this.clock.now()),
      ip: session.ip,
      portalName: PORTAL_TITLES[access.portal],
    });
  }

  /** Rotates the refresh token and re-checks that the user may still use the portal. */
  async refresh(portal: Portal, refreshToken: string, client: ClientInfo): Promise<SignedIn> {
    const hostSchoolId = this.hostSchoolFor(portal, client);
    const { session, refreshToken: next } = await this.sessions.rotate(refreshToken, portal, {
      schoolId: hostSchoolId,
    });
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    let access: PortalAccess;
    try {
      if (!user || user.deletedAt) throw AppException.unauthorized();
      access = await this.authorize(user, portal, session.schoolId ?? undefined);
    } catch (error) {
      await this.sessions.revoke(session.id, 'access_lost');
      if (error instanceof AppException)
        throw new AppException(HttpStatus.UNAUTHORIZED, error.message, error.code);
      throw error;
    }
    const token = this.tokens.sign(this.claimsFor(user, session, access));
    return { body: signedInBody(user, access, token), session, refreshToken: next };
  }

  /** Ends the current session (found from the access token or the refresh cookie). */
  async logout(
    session: AuthSession | null,
    allDevices: boolean,
  ): Promise<{ ok: true; signedOut: number }> {
    if (!session) return { ok: true, signedOut: 0 };
    let signedOut = (await this.sessions.revoke(session.id, 'sign_out')) ? 1 : 0;
    if (allDevices)
      signedOut += await this.sessions.revokeAllForUser(session.userId, 'sign_out_all');
    return { ok: true, signedOut };
  }

  async me(auth: AuthUserContext) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw AppException.unauthorized();
    const access = await this.access
      .resolve(user.id, auth.portal, { schoolId: auth.schoolId })
      .catch((error: unknown) => {
        if (error instanceof AppException)
          throw new AppException(HttpStatus.UNAUTHORIZED, error.message, error.code);
        throw error;
      });
    const portal = auth.portal.toLowerCase();
    if (access.portal === 'PLATFORM')
      return {
        ...platformUser(user, access.staff),
        portal,
        permissions: platformPermissions(access.staff),
      };
    return {
      portal,
      user:
        access.portal === 'TEACHER'
          ? teacherUser(user, access.membership)
          : schoolAdminUser(user, access.membership),
      school: schoolSummary(access.membership),
      schools: access.portal === 'SCHOOL_ADMIN' ? schoolChoices(access) : undefined,
      membership: membershipView(access.membership),
      supportSessionId: auth.supportSessionId ?? null,
    };
  }

  /** School Admin: move this session to another of the user's schools and issue a new token. */
  async switchSchool(auth: AuthUserContext, schoolId: string) {
    if (auth.portal !== Portal.SCHOOL_ADMIN)
      throw AppException.forbidden('Only School Admin can switch schools.', 'WRONG_PORTAL');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const access = await this.authorize(user, Portal.SCHOOL_ADMIN, schoolId);
    if (access.portal === 'PLATFORM') throw AppException.forbidden();
    await this.sessions.switchSchool(auth.sessionId, schoolId);
    await this.prisma.schoolMembership.update({
      where: { id: access.membership.id },
      data: { lastActiveAt: this.clock.now() },
    });
    const session = await this.prisma.authSession.findUniqueOrThrow({
      where: { id: auth.sessionId },
    });
    const token = this.tokens.sign(this.claimsFor(user, session, access));
    return signedInBody(user, access, token);
  }

  async notifyPasswordChanged(user: User, how: string) {
    if (!user.email) return;
    await this.notifications
      .email(user.email, 'password-changed', {
        firstName: user.firstName,
        when: formatWhen(this.clock.now()),
        how,
      })
      .catch((error: unknown) =>
        this.logger.warn({ msg: 'Password-changed email not queued', error: String(error) }),
      );
  }
}

/** "13 Nov 2026, 14:05 (Lagos time)" for emails. */
export function formatWhen(date: Date) {
  const text = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(date);
  return `${text} (Lagos time)`;
}
