import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Clock } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { User } from '../generated/prisma/client.js';
import type { Portal } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { parseIdentifier, type SignInIdentifier } from './identifiers.js';
import {
  afterFailure,
  incorrectMessage,
  lockedMessage,
  lockStatus,
  type LockoutRules,
} from './lockout.js';
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from './password.js';
import { PortalAccessService } from './portal-access.service.js';
import { sha256 } from './tokens.js';

const locked = (minutes: number) =>
  new AppException(HttpStatus.LOCKED, lockedMessage(minutes), 'ACCOUNT_LOCKED');

/**
 * Checks an identifier + password and keeps the lockout counters. Unknown identifiers get the
 * same answers, timing and countdown (kept in Redis) as real accounts, so sign-in never reveals
 * whether an email or phone number is registered.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: PortalAccessService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  parse(raw: string, field = 'email'): SignInIdentifier {
    const id = parseIdentifier(raw);
    if (!id)
      throw AppException.validation({ [field]: 'Enter a valid email address or phone number.' });
    return id;
  }

  findUser(id: SignInIdentifier) {
    return this.prisma.user.findFirst({
      where:
        id.kind === 'email'
          ? { email: id.value, deletedAt: null }
          : { phone: id.value, deletedAt: null },
    });
  }

  /**
   * @param schoolId the school whose sign-in rules apply, when known (the Host's school for the
   *   Teacher Workspace, an explicit choice for School Admin).
   */
  async verify(
    raw: string,
    password: string,
    portal: Portal,
    schoolId?: string,
    field = 'email',
  ): Promise<{ user: User; identifier: SignInIdentifier }> {
    const identifier = this.parse(raw, field);
    const user = await this.findUser(identifier);
    if (!user) {
      await burnPasswordCheck(password);
      return this.failUnknown(identifier, await this.rulesForUnknown(portal, schoolId));
    }

    const now = this.clock.now();
    const rules = await this.access.lockoutRules(user.id, portal, schoolId);
    const status = lockStatus(user, now);
    if (status.locked) throw locked(rules.minutes);
    if (status.reset) {
      // The pause ran out: start counting again.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedSignInCount: 0, lockedUntil: null },
      });
      user.failedSignInCount = 0;
      user.lockedUntil = null;
    }

    let ok = false;
    if (user.passwordHash) ok = await verifyPassword(user.passwordHash, password);
    else await burnPasswordCheck(password);

    if (!ok) {
      const { failedSignInCount } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedSignInCount: { increment: 1 }, lastFailedSignInAt: now },
        select: { failedSignInCount: true },
      });
      const result = afterFailure(failedSignInCount, rules, now);
      if (result.locked) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: result.lockedUntil },
        });
        throw locked(rules.minutes);
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        incorrectMessage(result.attemptsLeft, identifier.kind === 'phone'),
        'INVALID_CREDENTIALS',
      );
    }

    const updates: Partial<User> = {};
    if (user.failedSignInCount > 0 || user.lockedUntil) {
      updates.failedSignInCount = 0;
      updates.lockedUntil = null;
    }
    if (needsRehash(user.passwordHash!)) updates.passwordHash = await hashPassword(password);
    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: updates });
      Object.assign(user, updates);
    }
    return { user, identifier };
  }

  /** Unknown identifiers keep a countdown in Redis that mirrors a real account's. */
  private async failUnknown(id: SignInIdentifier, rules: LockoutRules): Promise<never> {
    const key = `auth:unknown:${sha256(`${id.kind}:${id.value}`)}`;
    const current = Number((await this.redis.get(key)) ?? 0);
    if (current >= rules.attempts) throw locked(rules.minutes);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, rules.minutes * 60);
    const result = afterFailure(count, rules, this.clock.now());
    if (result.locked) {
      await this.redis.expire(key, rules.minutes * 60);
      throw locked(rules.minutes);
    }
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      incorrectMessage(result.attemptsLeft, id.kind === 'phone'),
      'INVALID_CREDENTIALS',
    );
  }

  private async rulesForUnknown(portal: Portal, schoolId?: string): Promise<LockoutRules> {
    if (!schoolId || portal === 'PLATFORM') return this.access.platformLockoutRules;
    const settings = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    return settings
      ? { attempts: settings.lockoutAttempts, minutes: settings.lockoutMinutes }
      : this.access.platformLockoutRules;
  }
}
