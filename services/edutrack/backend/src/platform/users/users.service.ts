import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { normalizePhone } from '../../auth/identifiers.js';
import { InvitationService } from '../../auth/invitation.service.js';
import { PasswordResetService } from '../../auth/password-reset.service.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock, DAY } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated, toSkipTake } from '../../common/pagination/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Portal } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformAlertsService } from '../alerts/platform-alerts.service.js';
import { toneOf } from '../shared/audit-view.js';
import { displayPhone, formatAgo, formatDay, formatStamp, lagosToday } from '../shared/format.js';
import { PLATFORM_AREA, PlatformAuditService } from '../shared/platform-audit.service.js';
import {
  ADMIN_ROLE_KEY,
  ROLE_NOT_FOUND,
  roleRef,
  roleWhere,
  STAFF_STATUS_BY_LABEL,
  STAFF_STATUS_LABEL,
  USER_NOT_FOUND,
  withinPermissions,
} from '../shared/staff.js';
import type { UserDetailsDto, UserListQuery } from './dto/users.dto.js';

const staffInclude = {
  user: true,
  role: true,
  invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.PlatformStaffInclude;

type StaffRow = Prisma.PlatformStaffGetPayload<{ include: typeof staffInclude }>;
type InvitationRow = StaffRow['invitations'][number];

export type UserAction =
  | 'suspend'
  | 'reactivate'
  | 'deactivate'
  | 'password-reset'
  | 'sign-out'
  | 'resend-invitation'
  | 'revoke-invitation';

const ACTION_LABEL: Record<UserAction, string> = {
  suspend: 'User suspended',
  reactivate: 'User reactivated',
  deactivate: 'User deactivated',
  'password-reset': 'Password reset sent',
  'sign-out': 'Signed out of all sessions',
  'resend-invitation': 'Invitation resent',
  'revoke-invitation': 'Invitation revoked',
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/**
 * Back-office staff accounts: list, invite, edit, and the lifecycle actions (suspend, reactivate,
 * deactivate, password reset, sign out everywhere, resend or revoke an invitation).
 *
 * Guard rails: nobody can suspend, deactivate or change the role of themselves; nobody can hand
 * out a role with more access than their own; at least one active Platform Administrator stays.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly alerts: PlatformAlertsService,
    private readonly invitations: InvitationService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  /* ---------- Views ---------- */

  private invitationState(inv: InvitationRow | undefined) {
    if (!inv) return null;
    if (inv.status === 'ACCEPTED') return 'Accepted';
    if (inv.status === 'REVOKED') return 'Revoked';
    if (inv.status === 'EXPIRED' || inv.expiresAt <= this.clock.now()) return 'Expired';
    return inv.sendCount > 1 ? 'Resent' : 'Pending';
  }

  private async views(rows: StaffRow[]) {
    const inviterIds = [
      ...new Set(rows.map((s) => s.invitedById ?? s.invitations[0]?.invitedById).filter(Boolean)),
    ] as string[];
    const inviters = inviterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: inviterIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(inviters.map((u) => [u.id, fullName(u)]));
    const now = this.clock.now();
    return rows.map((s) => {
      const inv = s.invitations[0];
      const seen = [s.user.lastSeenAt, s.lastActiveAt]
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const inviter = s.invitedById ?? inv?.invitedById;
      return {
        id: s.userId,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        email: s.user.email ?? '',
        phone: displayPhone(s.user.phone),
        roleId: roleRef(s.role),
        roleName: s.role.name,
        status: STAFF_STATUS_LABEL[s.status],
        invitation: this.invitationState(inv),
        invitedBy: inviter ? (names.get(inviter) ?? null) : null,
        lastSeen: seen ? formatAgo(seen, now) : '—',
        createdAt: formatDay(s.createdAt),
      };
    });
  }

  private async load(userId: string): Promise<StaffRow> {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { userId },
      include: staffInclude,
    });
    if (!staff) throw AppException.notFound(USER_NOT_FOUND);
    return staff;
  }

  async get(userId: string) {
    const [view] = await this.views([await this.load(userId)]);
    return view!;
  }

  async list(query: UserListQuery) {
    const now = this.clock.now();
    const search = query.search?.trim();
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    // Midnight in Lagos (UTC+1, no daylight saving).
    const todayStart = new Date(lagosToday(now).getTime() - 3_600_000);
    const where: Prisma.PlatformStaffWhereInput = {
      AND: [
        query.view === 'invitations' ? { invitations: { some: {} } } : {},
        query.role ? { role: { name: { equals: query.role, mode: 'insensitive' } } } : {},
        query.status ? { status: STAFF_STATUS_BY_LABEL[query.status] } : {},
        query.created
          ? {
              createdAt: {
                gte: new Date(now.getTime() - (query.created === 'Last 30 days' ? 30 : 365) * DAY),
              },
            }
          : {},
        query.lastActive === 'Today'
          ? { user: { lastSeenAt: { gte: todayStart } } }
          : query.lastActive === 'Last 7 days'
            ? { user: { lastSeenAt: { gte: new Date(now.getTime() - 7 * DAY) } } }
            : query.lastActive
              ? { user: { lastSeenAt: { lt: new Date(now.getTime() - 30 * DAY) } } }
              : {},
        search
          ? {
              user: {
                OR: [
                  { firstName: contains(search) },
                  { lastName: contains(search) },
                  { email: contains(search) },
                ],
              },
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.platformStaff.findMany({
        where,
        include: staffInclude,
        orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        ...toSkipTake(query),
      }),
      this.prisma.platformStaff.count({ where }),
    ]);
    return paginated(await this.views(rows), total, query);
  }

  /* ---------- Guard rails ---------- */

  private actorId(): string {
    const id = RequestContext.get()?.userId;
    if (!id) throw AppException.unauthorized();
    return id;
  }

  private async findRole(ref: string) {
    const role = await this.prisma.platformRole.findUnique({ where: roleWhere(ref) });
    if (!role) throw AppException.validation({ roleId: 'Choose a role.' }, ROLE_NOT_FOUND);
    return role;
  }

  /** Nobody can give (or take away) more access than they hold themselves. */
  private async assertCanGrant(role: { permissions: Prisma.JsonValue }) {
    const mine = await this.prisma.platformStaff.findUnique({
      where: { userId: this.actorId() },
      select: { role: { select: { permissions: true } } },
    });
    if (!mine || !withinPermissions(role, mine.role))
      throw AppException.forbidden(
        'You can’t give someone more access than you have.',
        'ROLE_ABOVE_YOURS',
      );
  }

  private assertNotSelf(staff: StaffRow, verb: string) {
    if (staff.userId === this.actorId())
      throw AppException.forbidden(`You can’t ${verb} your own account.`, 'OWN_ACCOUNT');
  }

  /** Refuses to remove the last active Platform Administrator. */
  private async assertNotLastAdmin(staff: StaffRow) {
    if (staff.status !== 'ACTIVE' || staff.role.key !== ADMIN_ROLE_KEY) return;
    const others = await this.prisma.platformStaff.count({
      where: { status: 'ACTIVE', role: { key: ADMIN_ROLE_KEY }, id: { not: staff.id } },
    });
    if (others === 0)
      throw AppException.conflict('Keep at least one active Platform Administrator.', 'LAST_ADMIN');
  }

  private async parsePhone(raw: string | undefined, userId?: string): Promise<string | null> {
    if (!raw) return null;
    const phone = normalizePhone(raw);
    if (!phone)
      throw AppException.validation({ phone: 'Enter a phone number, like 0803 412 7781.' });
    const taken = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== userId)
      throw AppException.validation({
        phone: 'This phone number is already used by another EduTrack account.',
      });
    return phone;
  }

  /* ---------- Invite and edit ---------- */

  async invite(dto: UserDetailsDto) {
    const actorId = this.actorId();
    const role = await this.findRole(dto.roleId);
    await this.assertCanGrant(role);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { platformStaff: true },
    });
    // Someone who left (deactivated) is invited again on the same account.
    if (
      existing?.deletedAt ||
      (existing?.platformStaff && existing.platformStaff.status !== 'DEACTIVATED')
    )
      throw AppException.conflict(
        'This person already has an account or invitation.',
        'USER_EXISTS',
      );
    const phone = await this.parsePhone(dto.phone, existing?.id);
    const now = this.clock.now();

    const { invitationId, userId } = await this.prisma.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: { email: dto.email, firstName: dto.firstName, lastName: dto.lastName, phone },
        }));
      const staffData = {
        roleId: role.id,
        status: 'INVITED' as const,
        invitedById: actorId,
        invitedAt: now,
        activatedAt: null,
      };
      const staff = existing?.platformStaff
        ? await tx.platformStaff.update({
            where: { id: existing.platformStaff.id },
            data: staffData,
          })
        : await tx.platformStaff.create({ data: { userId: user.id, ...staffData } });
      const invitation = await tx.invitation.create({
        data: {
          kind: 'PLATFORM_STAFF',
          email: dto.email,
          userId: user.id,
          platformStaffId: staff.id,
          position: role.name,
          invitedById: actorId,
          // Replaced with a real token hash when the link is sent.
          tokenHash: `pending:${randomUUID()}`,
          expiresAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'user.invite',
          entity: 'User',
          entityId: user.id,
          summary: `User invited · ${dto.firstName} ${dto.lastName}`,
          next: `${dto.email} · ${role.name}`,
        },
        tx,
      );
      return { invitationId: invitation.id, userId: user.id };
    });
    await this.invitations.send(invitationId);
    return this.get(userId);
  }

  async update(userId: string, dto: UserDetailsDto) {
    const staff = await this.load(userId);
    const role = await this.findRole(dto.roleId);
    const roleChanged = role.id !== staff.roleId;
    if (roleChanged) {
      if (staff.userId === this.actorId())
        throw AppException.forbidden('You can’t change your own role.', 'OWN_ACCOUNT');
      await this.assertCanGrant(staff.role);
      await this.assertCanGrant(role);
      if (role.key !== ADMIN_ROLE_KEY) await this.assertNotLastAdmin(staff);
    }
    if (dto.email !== staff.user.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (taken && taken.id !== userId)
        throw AppException.validation({ email: 'Another EduTrack account uses this email.' });
    }
    const phone = await this.parsePhone(dto.phone, userId);
    const user = staff.user;
    const detailsChanged =
      dto.firstName !== user.firstName ||
      dto.lastName !== user.lastName ||
      dto.email !== user.email ||
      phone !== user.phone;
    if (!roleChanged && !detailsChanged) return this.get(userId);

    const name = `${dto.firstName} ${dto.lastName}`;
    await this.prisma.$transaction(async (tx) => {
      if (detailsChanged) {
        await tx.user.update({
          where: { id: userId },
          data: { firstName: dto.firstName, lastName: dto.lastName, email: dto.email, phone },
        });
        // A pending invitation follows the new address (the next resend goes there).
        if (dto.email !== user.email)
          await tx.invitation.updateMany({
            where: { platformStaffId: staff.id, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { email: dto.email },
          });
        await this.audit.record(
          {
            action: 'user.update',
            entity: 'User',
            entityId: userId,
            summary: `User details updated · ${name}`,
            previous: `${fullName(user)} · ${user.email ?? ''} · ${displayPhone(user.phone)}`,
            next: `${name} · ${dto.email} · ${displayPhone(phone)}`,
          },
          tx,
        );
      }
      if (roleChanged) {
        await tx.platformStaff.update({ where: { id: staff.id }, data: { roleId: role.id } });
        await this.audit.record(
          {
            action: 'user.change_role',
            entity: 'User',
            entityId: userId,
            summary: `Role changed · ${name} to ${role.name}`,
            previous: staff.role.name,
            next: role.name,
          },
          tx,
        );
      }
    });
    if (roleChanged && staff.status === 'ACTIVE')
      await this.alerts.tryNotify(
        'security.alert',
        {
          title: `Your back-office role is now ${role.name}`,
          detail: `Changed from ${staff.role.name}. If you didn’t expect this, tell a Platform Administrator.`,
          link: '/settings',
          entityType: 'User',
          entityId: userId,
        },
        { userIds: [userId] },
      );
    return this.get(userId);
  }

  /* ---------- Lifecycle actions ---------- */

  async act(userId: string, action: UserAction, reason?: string) {
    const staff = await this.load(userId);
    const name = fullName(staff.user);
    const before = STAFF_STATUS_LABEL[staff.status];
    let next: string = before;
    let after: Record<string, unknown> | undefined;

    switch (action) {
      case 'suspend':
        this.assertNotSelf(staff, 'suspend');
        if (staff.status !== 'ACTIVE')
          throw AppException.conflict('Only active users can be suspended.', 'NOT_ACTIVE');
        await this.assertNotLastAdmin(staff);
        await this.setStatus(staff, 'SUSPENDED');
        await this.sessions.revokeAllForUser(userId, 'admin');
        next = 'Suspended';
        break;

      case 'reactivate':
        if (staff.status !== 'SUSPENDED')
          throw AppException.conflict(
            staff.status === 'DEACTIVATED'
              ? 'Deactivated users can’t be reactivated. Invite them again instead.'
              : 'Only suspended users can be reactivated.',
            'NOT_SUSPENDED',
          );
        await this.setStatus(staff, 'ACTIVE');
        next = 'Active';
        break;

      case 'deactivate':
        this.assertNotSelf(staff, 'deactivate');
        if (staff.status === 'DEACTIVATED')
          throw AppException.conflict('This user is already deactivated.', 'ALREADY_DEACTIVATED');
        await this.assertNotLastAdmin(staff);
        await this.prisma.$transaction([
          this.prisma.platformStaff.update({
            where: { id: staff.id },
            data: { status: 'DEACTIVATED' },
          }),
          this.prisma.invitation.updateMany({
            where: { platformStaffId: staff.id, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { status: 'REVOKED', revokedAt: this.clock.now() },
          }),
        ]);
        await this.sessions.revokeAllForUser(userId, 'admin');
        next = 'Deactivated';
        break;

      case 'password-reset':
        if (staff.status !== 'ACTIVE' || !staff.user.passwordHash || !staff.user.email)
          throw AppException.conflict(
            'Password resets are for active users who have set a password.',
            'NOT_ACTIVE',
          );
        await this.passwordReset.requestReset(staff.user.email, Portal.PLATFORM, {
          ip: RequestContext.get()?.ip,
        });
        next = `Sent to ${staff.user.email}`;
        break;

      case 'sign-out': {
        const self = userId === this.actorId();
        const count = await this.sessions.revokeAllForUser(
          userId,
          'admin',
          self ? RequestContext.get()?.sessionId : undefined,
        );
        next = `${count} session${count === 1 ? '' : 's'} ended`;
        after = { sessions: count };
        if (!self && count > 0)
          await this.alerts.tryNotify(
            'security.alert',
            {
              title: 'You were signed out of the back office on every device',
              detail: 'A Platform Administrator ended your sessions. Sign in again to continue.',
              link: '/settings',
              entityType: 'User',
              entityId: userId,
            },
            { userIds: [userId] },
          );
        break;
      }

      case 'resend-invitation': {
        if (staff.status !== 'INVITED')
          throw AppException.conflict('Only pending invitations can be resent.', 'NOT_INVITED');
        const latest = staff.invitations[0];
        if (latest && (latest.status === 'PENDING' || latest.status === 'EXPIRED')) {
          await this.invitations.send(latest.id, { resend: true });
        } else {
          const invitation = await this.prisma.invitation.create({
            data: {
              kind: 'PLATFORM_STAFF',
              email: staff.user.email,
              userId,
              platformStaffId: staff.id,
              position: staff.role.name,
              invitedById: this.actorId(),
              tokenHash: `pending:${randomUUID()}`,
              expiresAt: this.clock.now(),
            },
          });
          await this.invitations.send(invitation.id);
        }
        next = 'Resent';
        break;
      }

      case 'revoke-invitation': {
        const latest = staff.invitations[0];
        if (
          staff.status !== 'INVITED' ||
          !latest ||
          (latest.status !== 'PENDING' && latest.status !== 'EXPIRED')
        )
          throw AppException.conflict('There’s no pending invitation to revoke.', 'NOT_INVITED');
        await this.prisma.$transaction([
          this.prisma.invitation.update({
            where: { id: latest.id },
            data: { status: 'REVOKED', revokedAt: this.clock.now() },
          }),
          this.prisma.platformStaff.update({
            where: { id: staff.id },
            data: { status: 'DEACTIVATED' },
          }),
        ]);
        next = 'Revoked';
        break;
      }
    }

    await this.audit.record({
      action: `user.${action.replace(/-/g, '_')}`,
      entity: action.endsWith('invitation') ? 'Invitation' : 'User',
      entityId: userId,
      summary: `${ACTION_LABEL[action]} · ${name}${reason ? ` · “${reason}”` : ''}`,
      previous: before,
      next,
      ...(after && { after }),
    });
    return this.get(userId);
  }

  private async setStatus(staff: StaffRow, status: 'ACTIVE' | 'SUSPENDED') {
    const { count } = await this.prisma.platformStaff.updateMany({
      where: { id: staff.id, status: staff.status },
      data: { status },
    });
    if (count === 0)
      throw AppException.conflict(
        'Someone else just changed this user. Reload and try again.',
        'USER_CHANGED',
      );
  }

  /* ---------- Detail tabs ---------- */

  async activity(userId: string) {
    await this.load(userId);
    const [events, signIns] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          area: PLATFORM_AREA,
          OR: [
            { actorUserId: userId },
            { entityType: { in: ['User', 'Invitation'] }, entityId: userId },
          ],
        },
        include: { school: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.authSession.findMany({
        where: { userId, portal: 'PLATFORM' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const entries = [
      ...events.map((e) => ({
        at: e.createdAt,
        id: e.id,
        title: e.summary,
        detail:
          e.actorUserId === userId
            ? (e.school?.name ?? e.entityType)
            : `by ${e.actorName ?? 'EduTrack'}`,
        tone: toneOf(e.action),
      })),
      ...signIns.map((s) => ({
        at: s.createdAt,
        id: s.id,
        title: 'Signed in',
        detail: [s.deviceLabel, s.location].filter(Boolean).join(' · ') || 'Back office',
        tone: 'neutral' as const,
      })),
    ];
    entries.sort((a, b) => b.at.getTime() - a.at.getTime());
    return entries.slice(0, 40).map(({ at, ...e }) => ({ ...e, when: formatStamp(at) }));
  }

  async security(userId: string) {
    const staff = await this.load(userId);
    const live = (await this.sessions.listActive(userId)).filter((s) => s.portal === 'PLATFORM');
    const labels = [
      ...new Set(
        live.map((s) => {
          const city = s.location?.split(',')[0]?.trim();
          return `${s.deviceLabel ?? 'Unknown device'}${city ? ` (${city})` : ''}`;
        }),
      ),
    ];
    return {
      lastPasswordChange: staff.user.passwordChangedAt
        ? formatDay(staff.user.passwordChangedAt)
        : '—',
      activeSessions: live.length ? `${live.length} · ${labels.join(', ')}` : '0',
      failedSignIns: staff.user.failedSignInCount,
      twoFactor: staff.user.totpEnabledAt ? 'On' : 'Coming soon',
    };
  }

  async openIssues(userId: string) {
    await this.load(userId);
    const count = await this.prisma.supportTicket.count({
      where: { assigneeUserId: userId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
    });
    return { count };
  }
}
