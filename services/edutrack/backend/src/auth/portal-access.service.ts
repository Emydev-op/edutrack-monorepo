import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, DAY } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import type { Prisma } from '../generated/prisma/client.js';
import { Portal } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LockoutRules } from './lockout.js';
import { strictest } from './lockout.js';
import {
  TEACHER_PORTAL_ROLE_KEYS,
  TEACHING_ONLY_ROLE_KEYS,
} from './permissions/school-permissions.js';

export const membershipInclude = {
  school: { include: { subscription: { include: { plan: true } }, settings: true } },
  staff: { include: { department: true } },
  roles: { include: { role: true } },
  branches: { select: { branchId: true } },
} satisfies Prisma.SchoolMembershipInclude;

export type MembershipWithSchool = Prisma.SchoolMembershipGetPayload<{
  include: typeof membershipInclude;
}>;

const platformInclude = { role: true } satisfies Prisma.PlatformStaffInclude;
export type PlatformStaffWithRole = Prisma.PlatformStaffGetPayload<{
  include: typeof platformInclude;
}>;

export type SchoolPortal = 'SCHOOL_ADMIN' | 'TEACHER';

export type PortalAccess =
  | { portal: 'PLATFORM'; staff: PlatformStaffWithRole }
  | {
      portal: SchoolPortal;
      /** The membership this session acts through. */
      membership: MembershipWithSchool;
      /** Every school this user can open in this portal (School Admin's school switcher). */
      choices: MembershipWithSchool[];
    };

export interface AccessTarget {
  /** The only school allowed (Host subdomain for the Teacher Workspace, or an explicit choice). */
  schoolId?: string;
  /** For School Admin without an explicit choice: the school used last. */
  preferredSchoolId?: string | null;
}

/** Portals that live on a school's subdomain (the school comes from the Host). */
export const HOST_PORTALS: ReadonlySet<Portal> = new Set([
  Portal.TEACHER,
  Portal.PARENT,
  Portal.STUDENT,
]);

const activeRoleKeys = (m: MembershipWithSchool) =>
  m.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.key);

/** Whether a staff membership's roles open this portal (independent of its status). */
export function opensPortal(m: MembershipWithSchool, portal: SchoolPortal): boolean {
  if (m.kind !== 'STAFF') return false;
  const keys = activeRoleKeys(m);
  if (portal === 'TEACHER') return keys.some((k) => k !== null && TEACHER_PORTAL_ROLE_KEYS.has(k));
  return keys.some((k) => k === null || !TEACHING_ONLY_ROLE_KEYS.has(k));
}

const isUsable = (m: MembershipWithSchool) =>
  m.status === 'ACTIVE' && m.school.status !== 'SUSPENDED';

/** Why a membership that opens the portal can't be used right now. */
function blockOf(m: MembershipWithSchool): AppException {
  if (m.school.status === 'SUSPENDED')
    return new AppException(
      HttpStatus.FORBIDDEN,
      `${m.school.name}’s access to EduTrack is suspended. Contact the school.`,
      'SCHOOL_SUSPENDED',
    );
  switch (m.status) {
    case 'SUSPENDED':
      return new AppException(
        HttpStatus.FORBIDDEN,
        m.statusReason ?? 'This account is suspended.',
        'ACCOUNT_SUSPENDED',
      );
    case 'INVITED':
      return new AppException(
        HttpStatus.FORBIDDEN,
        'This account is not activated yet.',
        'ACCOUNT_PENDING',
      );
    default:
      return new AppException(
        HttpStatus.FORBIDDEN,
        m.statusReason ?? 'This account is no longer active.',
        'ACCOUNT_DEACTIVATED',
      );
  }
}

const BLOCK_PRIORITY = ['SCHOOL_SUSPENDED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_DEACTIVATED'];

const noAccess = (portal: Portal) =>
  new AppException(
    HttpStatus.FORBIDDEN,
    portal === Portal.PLATFORM
      ? 'This account doesn’t have access to the EduTrack back office.'
      : portal === Portal.TEACHER
        ? 'This account doesn’t have access to the Teacher Workspace at this school.'
        : 'This account doesn’t have access to School Admin.',
    'NO_ACCESS',
  );

/**
 * Decides whether a user may use a portal (and as which membership), after their password was
 * verified. Also the single source of the school rules sign-in depends on: lockout and password
 * expiry.
 */
@Injectable()
export class PortalAccessService {
  private readonly platformLockout: LockoutRules;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.platformLockout = {
      attempts: config.get('PLATFORM_LOCKOUT_ATTEMPTS', { infer: true }),
      minutes: config.get('PLATFORM_LOCKOUT_MINUTES', { infer: true }),
    };
  }

  get platformLockoutRules(): LockoutRules {
    return this.platformLockout;
  }

  staffMemberships(userId: string, schoolId?: string) {
    return this.prisma.schoolMembership.findMany({
      where: { userId, kind: 'STAFF', ...(schoolId && { schoolId }) },
      include: membershipInclude,
      orderBy: { school: { name: 'asc' } },
    });
  }

  /** Throws the AccountBlock / NO_ACCESS answer when the user can't use the portal. */
  async resolve(userId: string, portal: Portal, target: AccessTarget = {}): Promise<PortalAccess> {
    if (portal === Portal.PLATFORM) {
      const staff = await this.prisma.platformStaff.findUnique({
        where: { userId },
        include: platformInclude,
      });
      if (!staff) throw noAccess(portal);
      if (staff.status === 'SUSPENDED')
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'This account is suspended.',
          'ACCOUNT_SUSPENDED',
        );
      if (staff.status === 'DEACTIVATED')
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'This account has been deactivated.',
          'ACCOUNT_DEACTIVATED',
        );
      if (staff.status === 'INVITED')
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'This account is not activated yet.',
          'ACCOUNT_PENDING',
        );
      return { portal: 'PLATFORM', staff };
    }
    if (portal !== Portal.SCHOOL_ADMIN && portal !== Portal.TEACHER)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'This portal isn’t available yet.',
        'PORTAL_UNAVAILABLE',
      );

    // School Admin lists every school for the switcher; the Teacher Workspace only its host school.
    const all = await this.staffMemberships(
      userId,
      portal === 'TEACHER' ? target.schoolId : undefined,
    );
    const eligible = all.filter((m) => opensPortal(m, portal));
    const scoped = target.schoolId
      ? eligible.filter((m) => m.schoolId === target.schoolId)
      : eligible;
    if (scoped.length === 0) throw noAccess(portal);
    const usable = scoped.filter(isUsable);
    if (usable.length === 0) {
      const blocks = scoped.map(blockOf);
      blocks.sort(
        (a, b) => rank(a.code, BLOCK_PRIORITY) - rank(b.code, BLOCK_PRIORITY), // most final first
      );
      throw blocks[0]!;
    }
    const chosen =
      usable.find((m) => m.schoolId === target.preferredSchoolId) ??
      [...usable].sort(
        (a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
      )[0]!;
    return { portal, membership: chosen, choices: eligible.filter(isUsable) };
  }

  /** Expired: flagged by an admin, or older than the school's rule (platform passwords don't expire). */
  isPasswordExpired(
    user: { mustChangePassword: boolean; passwordChangedAt: Date | null; createdAt: Date },
    access: PortalAccess,
  ): boolean {
    if (user.mustChangePassword) return true;
    if (access.portal === 'PLATFORM') return false;
    const days = access.membership.school.settings?.passwordExpiryDays ?? 90;
    if (days <= 0) return false;
    const changed = user.passwordChangedAt ?? user.createdAt;
    return this.clock.nowMs() - changed.getTime() > days * DAY;
  }

  /**
   * Lockout rules for a user signing in to a portal: the school's own rule when the school is known,
   * the strictest of their schools otherwise, and the platform default for the back office.
   */
  async lockoutRules(userId: string, portal: Portal, schoolId?: string): Promise<LockoutRules> {
    if (portal === Portal.PLATFORM) return this.platformLockout;
    const memberships = await this.prisma.schoolMembership.findMany({
      where: { userId, ...(schoolId && { schoolId }) },
      select: { school: { select: { settings: true } } },
    });
    const rules = memberships
      .map((m) => m.school.settings)
      .filter((s) => s !== null)
      .map((s) => ({ attempts: s.lockoutAttempts, minutes: s.lockoutMinutes }));
    return strictest(rules, this.platformLockout);
  }
}

function rank(code: string, order: string[]) {
  const i = order.indexOf(code);
  return i < 0 ? order.length : i;
}
