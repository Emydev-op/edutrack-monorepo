import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, MINUTE } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import type { Portal } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUserContext, ClientInfo } from './auth-context.js';
import { AuthService } from './auth.service.js';
import { CredentialsService } from './credentials.service.js';
import type { ChangePasswordDto, ResetPasswordDto } from './dto/auth.dto.js';
import {
  hashPassword,
  meetsPasswordPolicy,
  PASSWORD_POLICY_MESSAGE,
  verifyPassword,
} from './password.js';
import { PortalLinksService } from './portal-links.service.js';
import { SessionService } from './session.service.js';
import { randomToken, sha256 } from './tokens.js';

const invalidLink = () => AppException.badRequest('This reset link isn’t valid.', 'RESET_INVALID');

/** Forgot / reset / change password. Every change ends the user's other sessions. */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly ttlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly credentials: CredentialsService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly links: PortalLinksService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMinutes = config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
  }

  /** Validates the identifier's format up front (a 422 reveals nothing about accounts). */
  parseOrThrow(raw: string) {
    return this.credentials.parse(raw);
  }

  /**
   * Sends a single-use reset link when the account exists and can sign in. The caller answers
   * `{ ok: true }` either way, so this never reveals whether an email is registered.
   */
  async requestReset(raw: string, portal: Portal, client: ClientInfo): Promise<void> {
    const identifier = this.credentials.parse(raw);
    const user = await this.credentials.findUser(identifier);
    if (!user || user.status !== 'ACTIVE') return;

    const token = randomToken();
    const now = this.clock.now();
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + this.ttlMinutes * MINUTE),
          requestedIp: client.ip ?? null,
        },
      }),
    ]);
    const data = {
      firstName: user.firstName,
      link: this.links.resetPassword(portal, client.hostSchool?.slug, token),
      expiresInMinutes: this.ttlMinutes,
    };
    if (identifier.kind === 'phone' && user.phone)
      await this.notifications.sms(user.phone, 'password-reset', data);
    else if (user.email) await this.notifications.email(user.email, 'password-reset', data);
    this.logger.log({ msg: 'Password reset requested', userId: user.id });
  }

  async reset(dto: ResetPasswordDto): Promise<void> {
    const record = dto.token
      ? await this.prisma.passwordResetToken.findUnique({
          where: { tokenHash: sha256(dto.token) },
          include: { user: true },
        })
      : null;
    const now = this.clock.now();
    if (!record || record.usedAt || record.user.deletedAt) throw invalidLink();
    if (record.expiresAt <= now)
      throw new AppException(HttpStatus.GONE, 'This reset link has expired.', 'RESET_EXPIRED');
    if (!meetsPasswordPolicy(dto.password))
      throw AppException.validation({ password: PASSWORD_POLICY_MESSAGE });

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      // Single use, even under a double-submit: only one request flips usedAt.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count !== 1) throw invalidLink();
      return tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          mustChangePassword: false,
          failedSignInCount: 0,
          lockedUntil: null,
        },
      });
    });
    await this.sessions.revokeAllForUser(user.id, 'password_reset');
    await this.auth.notifyPasswordChanged(user, 'reset with an emailed link');
  }

  /** Signed in: change the password, keep this session, end the others. */
  async change(auth: AuthUserContext, dto: ChangePasswordDto): Promise<{ signedOut: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, dto.current)))
      throw AppException.validation({ current: 'Your current password is incorrect.' });
    if (!meetsPasswordPolicy(dto.next))
      throw AppException.validation({ next: PASSWORD_POLICY_MESSAGE });
    if (dto.next === dto.current)
      throw AppException.validation({ next: 'Choose a password you haven’t just used.' });
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(dto.next),
        passwordChangedAt: this.clock.now(),
        mustChangePassword: false,
      },
    });
    const signedOut = await this.sessions.revokeAllForUser(
      user.id,
      'password_changed',
      auth.sessionId,
    );
    await this.auth.notifyPasswordChanged(updated, 'changed from your account');
    return { signedOut };
  }
}
