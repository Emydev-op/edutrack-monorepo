import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { RATE_LIMITS } from '../../auth/auth.controller.js';
import { schoolAdminUser } from '../../auth/auth.presenter.js';
import type { ChangePasswordDto } from '../../auth/dto/auth.dto.js';
import { PasswordResetService } from '../../auth/password-reset.service.js';
import { membershipInclude } from '../../auth/portal-access.service.js';
import { SessionService } from '../../auth/session.service.js';
import { DAY } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { lagosToday } from '../../platform/shared/format.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { isoDate } from '../academics/academic-format.js';
import { asTx } from '../shared/tenant-tx.js';
import type { SignInRulesDto } from './dto/settings.dto.js';
import {
  RULE_KEYS,
  RULE_LIMITS,
  ruleProblem,
  ruleText,
  type SignInRules,
} from './settings-view.js';
import { SchoolSettingsService } from './settings.service.js';

/**
 * Settings › Security: the signed-in admin's own account (password, signed-in devices) and the
 * school's staff sign-in rules. The rules are the `SchoolSettings` columns sign-in enforces
 * (`CredentialsService` lockout, `PortalAccessService.isPasswordExpired`), so saving them changes
 * the next sign-in. Password changes and device sign-outs reuse the auth flows behind
 * `/v1/auth/password/change` and `/v1/auth/sessions`.
 */
@Injectable()
export class SettingsSecurityService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordResetService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private rulesOf(row: SignInRules): SignInRules {
    return {
      idleTimeoutMinutes: row.idleTimeoutMinutes,
      lockoutAttempts: row.lockoutAttempts,
      lockoutMinutes: row.lockoutMinutes,
      passwordExpiryDays: row.passwordExpiryDays,
    };
  }

  async view(auth: AuthUserContext) {
    const [user, membership, row, live] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      auth.membershipId
        ? this.tenant.db.schoolMembership.findFirst({
            where: { id: auth.membershipId },
            include: membershipInclude,
          })
        : null,
      this.settings.settingsRow(),
      this.sessions.listActive(auth.userId),
    ]);
    const rules = this.rulesOf(row);
    const changed = lagosToday(user.passwordChangedAt ?? user.createdAt);
    const who = membership ? schoolAdminUser(user, membership) : null;
    return {
      account: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email ?? '',
        position: who?.position ?? '',
        role: who?.roleName ?? '',
        passwordChangedOn: isoDate(changed),
        passwordExpiresOn: rules.passwordExpiryDays
          ? isoDate(new Date(changed.getTime() + rules.passwordExpiryDays * DAY))
          : null,
      },
      sessions: live
        .map((s) => ({
          id: s.id,
          device: s.deviceLabel ?? 'Unknown device',
          location: s.location ?? 'Unknown location',
          lastActive: s.lastSeenAt.toISOString(),
          current: s.id === auth.sessionId,
        }))
        .sort(
          (a, b) =>
            Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive),
        ),
      rules,
    };
  }

  /** Same rules as `/v1/auth/password/change`: keeps this session and ends the others. */
  async changePassword(auth: AuthUserContext, dto: ChangePasswordDto) {
    await this.rateLimit.consume([{ rule: RATE_LIMITS.changeUser, subject: auth.userId }]);
    const { signedOut } = await this.passwords.change(auth, dto);
    return { signedOut, view: await this.view(auth) };
  }

  async endSession(auth: AuthUserContext, id: string) {
    const live = await this.sessions.listActive(auth.userId);
    const session = live.find((s) => s.id === id);
    if (!session) throw AppException.notFound('That session has already ended.', 'SESSION_ENDED');
    if (session.id === auth.sessionId)
      throw AppException.conflict(
        'Use Sign out in the account menu to end this session.',
        'CURRENT_SESSION',
      );
    await this.sessions.revoke(session.id, 'signed_out_elsewhere');
    return this.view(auth);
  }

  async signOutOthers(auth: AuthUserContext) {
    await this.sessions.revokeAllForUser(auth.userId, 'signed_out_elsewhere', auth.sessionId);
    return this.view(auth);
  }

  async saveRules(auth: AuthUserContext, dto: SignInRulesDto) {
    const row = await this.settings.settingsRow();
    const before = this.rulesOf(row);
    const next = { ...before };
    for (const key of RULE_KEYS) {
      const v = dto[key];
      if (v === undefined) continue;
      const problem = ruleProblem(key, v);
      if (problem) throw AppException.validation({ [key]: problem });
      next[key] = v;
    }
    await this.tenant.db.$transaction(async (tx) => {
      await tx.schoolSettings.update({ where: { schoolId: row.schoolId }, data: next });
      await this.settings.log(
        RULE_KEYS.map((key) => ({
          area: 'Security' as const,
          setting: RULE_LIMITS[key][2],
          from: ruleText(key, before[key]),
          to: ruleText(key, next[key]),
        })),
        asTx(tx),
      );
    });
    return this.view(auth);
  }
}
