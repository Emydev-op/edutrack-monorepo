import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InvitationService } from '../../auth/invitation.service.js';
import { PasswordResetService } from '../../auth/password-reset.service.js';
import { TEACHING_ONLY_ROLE_KEYS } from '../../auth/permissions/school-permissions.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MembershipStatus } from '../../generated/prisma/enums.js';
import { Portal } from '../../generated/prisma/enums.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import {
  ADMIN_ROLE_KEYS,
  ago,
  dayMonthYear,
  describePermissions,
  fullName,
  grants,
  MEMBERSHIP_STATUS_LABEL,
  monthYear,
  OWNER_ROLE_NAME,
  SCHOOL_ADMIN_ROLE_NAME,
  sortRoles,
  splitName,
  toTimeline,
  auditDb,
  type TenantTx,
} from './access.js';
import type { AccessDto, InviteUserDto } from './dto/users.dto.js';

export const USER_NOT_FOUND = 'This user doesn’t exist.';

const userInclude = {
  user: true,
  staff: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { name: true } } } },
} satisfies Prisma.SchoolMembershipInclude;

type MembershipRow = Prisma.SchoolMembershipGetPayload<{ include: typeof userInclude }>;
type Tx = TenantTx;

export type UserAction =
  'suspend' | 'reactivate' | 'deactivate' | 'password-reset' | 'resend' | 'revoke';

/** Which statuses each action works from (as the School Admin mock). */
const ALLOWED: Record<UserAction, MembershipStatus[]> = {
  suspend: ['ACTIVE'],
  reactivate: ['SUSPENDED'],
  deactivate: ['SUSPENDED', 'ACTIVE'],
  'password-reset': ['ACTIVE'],
  resend: ['INVITED'],
  revoke: ['INVITED'],
};

const liveRoles = (m: MembershipRow) =>
  m.roles.filter((r) => !r.role.archivedAt).map((r) => r.role);

/**
 * Settings › Users: the school's staff accounts (a STAFF `SchoolMembership` with its `User`, roles
 * and branch access). Invitations go through the shared `InvitationService` (same email and accept
 * page as the back office's invites); suspending or deactivating ends the person's sessions at
 * this school. The school always keeps an active Owner or School Admin, and nobody can lock
 * themself out.
 */
@Injectable()
export class SchoolUsersService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly invitations: InvitationService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private actor() {
    const ctx = RequestContext.get();
    return { userId: ctx?.userId ?? '', membershipId: ctx?.membershipId ?? '' };
  }

  /* ---------------- Views ---------------- */

  private toRow(m: MembershipRow) {
    const now = this.clock.now();
    const lastSeen = [m.lastActiveAt, m.user.lastSeenAt, m.user.lastSignInAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: m.id,
      staffId: m.staffId,
      name: fullName(m.staff ?? m.user),
      email: m.user.email ?? m.staff?.email ?? '',
      position: m.staff?.positionTitle ?? 'Staff',
      roles: sortRoles(liveRoles(m)).map((r) => r.name),
      scope: m.scope === 'BRANCH' ? ('Branch' as const) : ('School' as const),
      branches:
        m.scope === 'BRANCH' ? m.branches.map((b) => b.branch.name).sort() : ([] as string[]),
      status: MEMBERSHIP_STATUS_LABEL[m.status],
      lastActive: m.status === 'ACTIVE' && lastSeen ? ago(lastSeen, now) : '—',
      created: monthYear(m.staff?.startedOn ?? m.activatedAt ?? m.createdAt, now),
      invited: m.status === 'INVITED' ? dayMonthYear(m.invitedAt ?? m.createdAt, now) : null,
    };
  }

  private async load(id: string, db: Tx = this.db): Promise<MembershipRow> {
    const m = isUuid(id)
      ? await db.schoolMembership.findFirst({ where: { id, kind: 'STAFF' }, include: userInclude })
      : null;
    if (!m) throw AppException.notFound(USER_NOT_FOUND);
    return m;
  }

  async list() {
    const rows = await this.db.schoolMembership.findMany({
      where: { kind: 'STAFF' },
      include: userInclude,
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
    return rows.map((m) => this.toRow(m));
  }

  async row(id: string) {
    return this.toRow(await this.load(id));
  }

  async detail(id: string) {
    const m = await this.load(id);
    const history = await this.audit.history('User', m.id);
    const now = this.clock.now();
    return {
      ...this.toRow(m),
      isYou: m.userId === this.actor().userId,
      staffNumber: m.staff?.staffNumber ?? null,
      can: describePermissions(liveRoles(m).map((r) => r.permissions)),
      history: [
        ...toTimeline(history, now),
        {
          id: 'created',
          title: 'Account created',
          detail: m.status === 'INVITED' ? 'Invitation sent' : 'Invitation accepted',
          when: monthYear(m.staff?.startedOn ?? m.activatedAt ?? m.createdAt, now),
          at: m.createdAt.toISOString(),
        },
      ],
    };
  }

  /** Staff for pickers (branch head, position holders, invites), with their account state. */
  async staffOptions() {
    const staff = await this.db.staff.findMany({
      where: { status: 'ACTIVE' },
      include: { membership: { include: { roles: { include: { role: true } } } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return staff.map((s) => {
      const m = s.membership && s.membership.status !== 'REVOKED' ? s.membership : null;
      const roles = m
        ? sortRoles(m.roles.filter((r) => !r.role.archivedAt).map((r) => r.role)).map((r) => r.name)
        : [];
      return {
        id: s.id,
        name: fullName(s),
        position: s.positionTitle ?? '',
        account: m ? MEMBERSHIP_STATUS_LABEL[m.status] : ('No account' as const),
        hasSchoolWideAccess:
          !!m && (m.scope === 'SCHOOL' || roles.includes(SCHOOL_ADMIN_ROLE_NAME)),
        roles,
      };
    });
  }

  /** Whether the caller's roles grant any of these permissions (routes shared by several screens). */
  async requireAny(permissions: string[]) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: this.actor().membershipId, status: 'ACTIVE' },
      select: { roles: { select: { role: { select: { permissions: true, archivedAt: true } } } } },
    });
    const maps = (m?.roles ?? []).filter((r) => !r.role.archivedAt).map((r) => r.role.permissions);
    if (!permissions.some((p) => grants(maps, p))) throw AppException.forbidden();
  }

  /* ---------------- Access rules ---------------- */

  /** Roles (by name) and branches (by name) of an access form, checked as the mock does. */
  private async resolveAccess(dto: AccessDto, db: Tx = this.db) {
    if (!dto.roles.length) throw AppException.validation({ roles: 'Choose at least one role.' });
    const names = [...new Set(dto.roles)];
    const roles = await db.schoolRole.findMany({
      where: { name: { in: names }, archivedAt: null },
    });
    if (roles.length !== names.length)
      throw AppException.validation({ roles: 'One of those roles doesn’t exist.' });
    let branches: { id: string; name: string }[] = [];
    if (dto.scope === 'Branch') {
      const wanted = [...new Set(dto.branches)];
      if (!wanted.length)
        throw AppException.validation({ branches: 'Choose at least one branch.' });
      branches = await db.branch.findMany({
        where: { name: { in: wanted } },
        select: { id: true, name: true },
      });
      if (branches.length !== wanted.length)
        throw AppException.validation({ branches: 'One of those branches doesn’t exist.' });
    }
    return { roles, branches };
  }

  /** The caller holds the Owner role. */
  private async actorIsOwner(db: Tx = this.db) {
    const count = await db.membershipRole.count({
      where: { membershipId: this.actor().membershipId, role: { key: 'owner', archivedAt: null } },
    });
    return count > 0;
  }

  /**
   * Refuses a change that would leave the school without an active Owner or School Admin: `m`
   * stops being one (roles removed, suspended or deactivated) and nobody else active is.
   */
  private async keepAnAdmin(
    m: MembershipRow,
    after: { keys: (string | null)[]; active: boolean },
    db: Tx,
  ) {
    const isAdmin = (keys: (string | null)[]) =>
      keys.some((k) => (ADMIN_ROLE_KEYS as readonly string[]).includes(k ?? ''));
    const wasAdmin = m.status === 'ACTIVE' && isAdmin(liveRoles(m).map((r) => r.key));
    if (!wasAdmin || (after.active && isAdmin(after.keys))) return;
    const others = await db.schoolMembership.count({
      where: {
        id: { not: m.id },
        kind: 'STAFF',
        status: 'ACTIVE',
        roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] }, archivedAt: null } } },
      },
    });
    if (!others)
      throw AppException.conflict(
        `${fullName(m.staff ?? m.user)} is the school’s only active Owner or School Admin. Give someone else one of those roles first.`,
        'LAST_ADMIN',
      );
  }

  /** Ends the person's sessions at this school (School Admin and Teacher Workspace). */
  private async endSessions(userId: string) {
    const live = await this.db.authSession.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    for (const s of live) await this.sessions.revoke(s.id, 'access_lost');
  }

  /* ---------------- Invite ---------------- */

  async invite(dto: InviteUserDto) {
    const schoolId = RequestContext.schoolId()!;
    const staff = dto.staffId
      ? isUuid(dto.staffId)
        ? await this.db.staff.findFirst({ where: { id: dto.staffId, status: 'ACTIVE' } })
        : null
      : null;
    if (dto.staffId && !staff)
      throw AppException.validation({ staffId: 'Choose the staff member.' });
    const name = staff ? fullName(staff) : (dto.name ?? '').trim();
    if (!name) throw AppException.validation({ name: 'Enter their full name.' });
    const email = dto.email;
    if (dto.roles.includes(OWNER_ROLE_NAME))
      throw AppException.validation({ roles: 'The Owner role can’t be given by invitation.' });
    const { roles, branches } = await this.resolveAccess(dto);
    const now = this.clock.now();

    const { membershipId, invitationId } = await this.db.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      const existing = user
        ? await tx.schoolMembership.findUnique({
            where: { schoolId_userId_kind: { schoolId, userId: user.id, kind: 'STAFF' } },
          })
        : null;
      if (existing && !['DEACTIVATED', 'REVOKED'].includes(existing.status))
        throw AppException.conflict(
          'This email already has an account or a pending invitation.',
          'EMAIL_TAKEN',
        );
      if (staff) {
        const held = await tx.schoolMembership.findUnique({
          where: { schoolId_staffId: { schoolId, staffId: staff.id } },
        });
        if (held && held.id !== existing?.id) {
          if (!['DEACTIVATED', 'REVOKED'].includes(held.status))
            throw AppException.conflict(
              `${fullName(staff)} already has an account.`,
              'STAFF_HAS_ACCOUNT',
            );
          // A closed account of someone else's email keeps its history but lets go of the record.
          await tx.schoolMembership.update({ where: { id: held.id }, data: { staffId: null } });
        }
      }
      if (!user) {
        const parts = splitName(name);
        user = await tx.user.create({ data: { email, ...parts } });
      }
      const access = {
        status: 'INVITED' as const,
        scope: dto.scope === 'Branch' ? ('BRANCH' as const) : ('SCHOOL' as const),
        staffId: staff?.id ?? existing?.staffId ?? null,
        invitedAt: now,
        activatedAt: null,
        statusReason: null,
      };
      let membership;
      if (existing) {
        await tx.membershipRole.deleteMany({ where: { membershipId: existing.id } });
        await tx.membershipBranch.deleteMany({ where: { membershipId: existing.id } });
        await tx.invitation.updateMany({
          where: { membershipId: existing.id, status: { in: ['PENDING', 'EXPIRED'] } },
          data: { status: 'REVOKED', revokedAt: now },
        });
        membership = await tx.schoolMembership.update({
          where: { id: existing.id },
          data: {
            ...access,
            roles: { create: roles.map((r) => ({ roleId: r.id })) },
            branches: { create: branches.map((b) => ({ branchId: b.id })) },
          },
        });
      } else {
        membership = await tx.schoolMembership.create({
          data: {
            schoolId,
            userId: user.id,
            kind: 'STAFF',
            ...access,
            roles: { create: roles.map((r) => ({ roleId: r.id })) },
            branches: { create: branches.map((b) => ({ branchId: b.id })) },
          },
        });
      }
      const invitation = await tx.invitation.create({
        data: {
          kind: 'SCHOOL_STAFF',
          email,
          userId: user.id,
          schoolId,
          membershipId: membership.id,
          position: staff?.positionTitle ?? sortRoles(roles)[0]!.name,
          invitedById: this.actor().userId || null,
          // Replaced with a real token hash when the link is sent.
          tokenHash: `pending:${randomUUID()}`,
          expiresAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'user.invite',
          area: 'Users',
          entity: 'User',
          entityId: membership.id,
          summary: `Invited as ${sortRoles(roles)
            .map((r) => r.name)
            .join(', ')}`,
          detail: dto.scope === 'School' ? 'Whole school' : branches.map((b) => b.name).join(', '),
          after: { email, roles: roles.map((r) => r.name), scope: dto.scope },
        },
        auditDb(tx),
      );
      return { membershipId: membership.id, invitationId: invitation.id };
    });
    await this.sendInvitation(invitationId);
    return this.row(membershipId);
  }

  /** Sends through the shared invitation service; a mail outage is a 502 the screen can show. */
  private async sendInvitation(invitationId: string, resend = false) {
    try {
      await this.invitations.send(invitationId, { resend });
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'We couldn’t send the invitation email. Check the address and try again.',
        'INVITATION_NOT_SENT',
      );
    }
  }

  /* ---------------- Access ---------------- */

  async updateAccess(id: string, dto: AccessDto) {
    const m = await this.load(id);
    const { roles, branches } = await this.resolveAccess(dto);
    const before = liveRoles(m);
    const beforeNames = before.map((r) => r.name);
    const afterNames = roles.map((r) => r.name);
    const isYou = m.userId === this.actor().userId;

    if (
      isYou &&
      beforeNames.includes(SCHOOL_ADMIN_ROLE_NAME) &&
      !afterNames.includes(SCHOOL_ADMIN_ROLE_NAME)
    )
      throw AppException.conflict('You can’t remove your own School Admin role.', 'SELF_LOCKOUT');
    if (
      isYou &&
      !grants(
        roles.map((r) => r.permissions),
        'settings.users',
      )
    )
      throw AppException.conflict(
        'You can’t remove your own access to Users & Roles.',
        'SELF_LOCKOUT',
      );
    const ownerChanged =
      beforeNames.includes(OWNER_ROLE_NAME) !== afterNames.includes(OWNER_ROLE_NAME);
    if (ownerChanged && !(await this.actorIsOwner()))
      throw AppException.forbidden(
        'Only an Owner can give or remove the Owner role.',
        'OWNER_ONLY',
      );
    if (ownerChanged && m.status === 'INVITED' && afterNames.includes(OWNER_ROLE_NAME))
      throw AppException.validation({ roles: 'The Owner role can’t be given by invitation.' });

    const added = sortRoles(roles.filter((r) => !beforeNames.includes(r.name))).map((r) => r.name);
    const removed = sortRoles(before.filter((r) => !afterNames.includes(r.name))).map(
      (r) => r.name,
    );
    const scopeText =
      dto.scope === 'School' ? 'Whole school' : branches.map((b) => b.name).join(', ');

    await this.db.$transaction(async (tx) => {
      await this.keepAnAdmin(
        m,
        { keys: roles.map((r) => r.key), active: m.status === 'ACTIVE' },
        tx,
      );
      await tx.membershipRole.deleteMany({
        where: { membershipId: m.id, roleId: { notIn: roles.map((r) => r.id) } },
      });
      await tx.membershipRole.createMany({
        data: roles.map((r) => ({ schoolId: m.schoolId, membershipId: m.id, roleId: r.id })),
        skipDuplicates: true,
      });
      await tx.membershipBranch.deleteMany({ where: { membershipId: m.id } });
      if (branches.length)
        await tx.membershipBranch.createMany({
          data: branches.map((b) => ({ schoolId: m.schoolId, membershipId: m.id, branchId: b.id })),
        });
      await tx.schoolMembership.update({
        where: { id: m.id },
        data: { scope: dto.scope === 'Branch' ? 'BRANCH' : 'SCHOOL' },
      });
      await this.audit.record(
        {
          action: 'user.access',
          area: 'Users',
          entity: 'User',
          entityId: m.id,
          summary: 'Access changed',
          detail: [
            added.length ? `+${added.join(', +')}` : '',
            removed.length ? `−${removed.join(', −')}` : '',
            scopeText,
          ]
            .filter(Boolean)
            .join(' · '),
          before: { roles: beforeNames, scope: m.scope },
          after: { roles: afterNames, scope: dto.scope },
        },
        auditDb(tx),
      );
    });
    return this.row(m.id);
  }

  /* ---------------- Account actions ---------------- */

  async act(id: string, action: UserAction, reason?: string) {
    const m = await this.load(id);
    const label = MEMBERSHIP_STATUS_LABEL[m.status];
    if (!ALLOWED[action].includes(m.status))
      throw AppException.conflict(
        `That isn’t possible while the account is ${label.toLowerCase()}.`,
        'INVALID_STATUS',
      );
    const isYou = m.userId === this.actor().userId;
    if (isYou && (action === 'suspend' || action === 'deactivate'))
      throw AppException.conflict(
        'You can’t suspend or deactivate your own account.',
        'SELF_LOCKOUT',
      );
    const isOwner = liveRoles(m).some((r) => r.key === 'owner');
    if (
      isOwner &&
      (action === 'suspend' || action === 'deactivate') &&
      !(await this.actorIsOwner())
    )
      throw AppException.forbidden(
        'Only an Owner can suspend or deactivate an Owner.',
        'OWNER_ONLY',
      );
    const now = this.clock.now();
    const record = (summary: string, detail?: string, tx?: Tx) =>
      this.audit.record(
        {
          action: `user.${action}`,
          area: 'Users',
          entity: 'User',
          entityId: m.id,
          summary,
          detail,
        },
        tx ? auditDb(tx) : undefined,
      );

    switch (action) {
      case 'suspend': {
        if (!reason) throw AppException.validation({ reason: 'Give a reason for suspending.' });
        await this.db.$transaction(async (tx) => {
          await this.keepAnAdmin(m, { keys: [], active: false }, tx);
          await tx.schoolMembership.update({
            where: { id: m.id },
            data: { status: 'SUSPENDED', statusReason: reason },
          });
          await record('Suspended account', reason, tx);
        });
        await this.endSessions(m.userId);
        break;
      }
      case 'reactivate':
        await this.db.$transaction(async (tx) => {
          await tx.schoolMembership.update({
            where: { id: m.id },
            data: { status: 'ACTIVE', statusReason: null },
          });
          await record('Reactivated account', reason, tx);
        });
        break;
      case 'deactivate':
        await this.db.$transaction(async (tx) => {
          await this.keepAnAdmin(m, { keys: [], active: false }, tx);
          await tx.schoolMembership.update({
            where: { id: m.id },
            data: { status: 'DEACTIVATED', statusReason: reason ?? null },
          });
          await record('Deactivated account', reason, tx);
        });
        await this.endSessions(m.userId);
        break;
      case 'password-reset': {
        if (!m.user.email || !m.user.passwordHash)
          throw AppException.conflict(
            'Password resets are for people who have set a password.',
            'NO_PASSWORD',
          );
        const school = await this.db.school.findUniqueOrThrow({
          where: { id: m.schoolId },
          select: { id: true, slug: true, name: true },
        });
        const teacherOnly = liveRoles(m).every((r) => r.key && TEACHING_ONLY_ROLE_KEYS.has(r.key));
        await this.passwordReset.requestReset(
          m.user.email,
          teacherOnly ? Portal.TEACHER : Portal.SCHOOL_ADMIN,
          { ip: RequestContext.get()?.ip, hostSchool: school },
        );
        await record('Sent password reset', m.user.email);
        break;
      }
      case 'resend': {
        let invitation = await this.db.invitation.findFirst({
          where: { membershipId: m.id, status: { in: ['PENDING', 'EXPIRED'] } },
          orderBy: { createdAt: 'desc' },
        });
        invitation ??= await this.db.invitation.create({
          data: {
            kind: 'SCHOOL_STAFF',
            email: m.user.email,
            phone: m.user.email ? null : m.user.phone,
            userId: m.userId,
            schoolId: m.schoolId,
            membershipId: m.id,
            position: m.staff?.positionTitle ?? null,
            invitedById: this.actor().userId || null,
            tokenHash: `pending:${randomUUID()}`,
            expiresAt: now,
          },
        });
        await this.sendInvitation(invitation.id, true);
        await this.db.schoolMembership.update({ where: { id: m.id }, data: { invitedAt: now } });
        await record('Resent invitation');
        break;
      }
      case 'revoke':
        await this.db.$transaction(async (tx) => {
          await tx.invitation.updateMany({
            where: { membershipId: m.id, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { status: 'REVOKED', revokedAt: now },
          });
          await tx.schoolMembership.update({ where: { id: m.id }, data: { status: 'REVOKED' } });
          await record('Revoked invitation', undefined, tx);
        });
        break;
    }
    return this.row(m.id);
  }
}
