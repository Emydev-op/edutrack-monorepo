import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isNigerianState } from '@edutrack/shared';
import { Clock, DAY } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated, toSkipTake } from '../../common/pagination/pagination.js';
import type { Env } from '../../config/env.validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { InvitationService } from '../../auth/invitation.service.js';
import { SessionService } from '../../auth/session.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  formatDay,
  formatMonth,
  formatNaira,
  lagosToday,
  schoolStatusLabel,
} from '../shared/format.js';
import { toAuditEntry, toneOf } from '../shared/audit-view.js';
import { SCHOOL_NOT_FOUND } from '../shared/params.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import type {
  BulkSuspendDto,
  InviteSchoolAdminDto,
  SchoolListQuery,
  UpdateSchoolDto,
} from './dto/schools.dto.js';
import {
  adminMembershipsWhere,
  schoolInclude,
  statusWhere,
  toSchoolView,
  type SchoolWithView,
} from './school-view.js';

/** How long a platform support session lasts. */
export const SUPPORT_SESSION_MINUTES = 30;

@Injectable()
export class SchoolsService {
  readonly baseDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.baseDomain = config.get('APP_BASE_DOMAIN', { infer: true });
  }

  view(school: SchoolWithView) {
    return toSchoolView(school, this.baseDomain);
  }

  async load(id: string): Promise<SchoolWithView> {
    const school = await this.prisma.school.findUnique({ where: { id }, include: schoolInclude });
    if (!school) throw AppException.notFound(SCHOOL_NOT_FOUND);
    return school;
  }

  async get(id: string) {
    return this.view(await this.load(id));
  }

  async list(query: SchoolListQuery) {
    const search = query.search?.trim();
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const where: Prisma.SchoolWhereInput = {
      AND: [
        query.status ? statusWhere(query.status) : {},
        query.plan
          ? { subscription: { plan: { name: { equals: query.plan, mode: 'insensitive' } } } }
          : {},
        query.state ? { state: { equals: query.state, mode: 'insensitive' } } : {},
        search
          ? {
              OR: [
                { name: contains(search) },
                { legalName: contains(search) },
                { slug: contains(search) },
                { state: contains(search) },
                { email: contains(search) },
                {
                  schoolMemberships: {
                    some: {
                      ...adminMembershipsWhere,
                      user: {
                        OR: [{ firstName: contains(search) }, { lastName: contains(search) }],
                      },
                    },
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        include: schoolInclude,
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.school.count({ where }),
    ]);
    return paginated(
      rows.map((s) => this.view(s)),
      total,
      query,
    );
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.load(id);
    const phone = normalizePhone(dto.phone);
    if (!phone)
      throw AppException.validation({ phone: 'Enter a phone number, like 0809 120 4400.' });
    if (!isNigerianState(dto.state))
      throw AppException.validation({ state: 'Select a Nigerian state.' });
    await this.ensureNameFree(dto.name, id);
    const changed: string[] = [];
    if (school.name !== dto.name) changed.push('name');
    if ((school.email ?? '') !== dto.contactEmail) changed.push('email');
    if ((school.phone ?? '') !== phone) changed.push('phone');
    if ((school.state ?? '') !== dto.state) changed.push('state');
    if (changed.length === 0) return this.view(school);
    await this.prisma.$transaction(async (tx) => {
      await tx.school.update({
        where: { id },
        data: { name: dto.name, email: dto.contactEmail, phone, state: dto.state },
      });
      await this.audit.record(
        {
          action: 'school.update',
          entity: 'School',
          entityId: id,
          schoolId: id,
          summary: `Edited school details · ${dto.name}`,
          previous: changed.includes('name') ? school.name : `${changed.join(', ')} before`,
          next: changed.includes('name') ? dto.name : `${changed.join(', ')} updated`,
          before: {
            name: school.name,
            email: school.email,
            phone: school.phone,
            state: school.state,
          },
          after: { name: dto.name, email: dto.contactEmail, phone, state: dto.state },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async ensureNameFree(name: string, exceptId?: string) {
    const taken = await this.prisma.school.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken)
      throw AppException.conflict('A school with this name already exists.', 'SCHOOL_EXISTS');
  }

  /* ---------- Suspension ---------- */

  async suspend(id: string, reason: string) {
    await this.suspendMany([id], reason);
    return this.get(id);
  }

  async bulkSuspend(dto: BulkSuspendDto) {
    const ids = [...new Set(dto.ids.map((id) => id.toLowerCase()))];
    const found = await this.prisma.school.count({ where: { id: { in: ids } } });
    if (found !== ids.length)
      throw AppException.notFound('One of the selected schools doesn’t exist.');
    const suspended = await this.suspendMany(ids, dto.reason, { skipSuspended: true });
    return { suspended };
  }

  /**
   * Suspends schools: staff, parents and students are signed out at once and can't sign in until
   * the school is reactivated. The status before suspension is kept in the audit trail.
   */
  private async suspendMany(ids: string[], reason: string, { skipSuspended = false } = {}) {
    const schools = await this.prisma.school.findMany({
      where: { id: { in: ids } },
      include: { subscription: { select: { status: true } } },
    });
    if (schools.length === 0) throw AppException.notFound(SCHOOL_NOT_FOUND);
    const targets = schools.filter((s) => s.status !== 'SUSPENDED');
    if (targets.length === 0 && !skipSuspended)
      throw AppException.conflict('This school is already suspended.', 'ALREADY_SUSPENDED');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      for (const school of targets) {
        await tx.school.update({
          where: { id: school.id },
          data: { status: 'SUSPENDED', suspendedAt: now, suspensionReason: reason },
        });
        await this.audit.record(
          {
            action: 'school.suspend',
            entity: 'School',
            entityId: school.id,
            schoolId: school.id,
            summary: `School suspended · ${school.name} · “${reason}”`,
            previous: schoolStatusLabel(school.status, school.subscription?.status),
            next: 'Suspended',
            before: { status: school.status },
            after: { reason },
          },
          tx,
        );
      }
    });
    for (const school of targets)
      await this.sessions.revokeAllForSchool(school.id, 'school_suspended');
    return targets.length;
  }

  async reactivate(id: string) {
    const school = await this.load(id);
    if (school.status !== 'SUSPENDED')
      throw AppException.conflict('This school isn’t suspended.', 'NOT_SUSPENDED');
    const lastSuspension = await this.prisma.auditEvent.findFirst({
      where: { schoolId: id, action: 'school.suspend' },
      orderBy: { createdAt: 'desc' },
      select: { before: true },
    });
    const previous = (lastSuspension?.before as { status?: string } | null)?.status;
    const status = previous === 'ONBOARDING' ? 'ONBOARDING' : 'ACTIVE';
    await this.prisma.$transaction(async (tx) => {
      await tx.school.update({
        where: { id },
        data: { status, suspendedAt: null, suspensionReason: null },
      });
      await this.audit.record(
        {
          action: 'school.reactivate',
          entity: 'School',
          entityId: id,
          schoolId: id,
          summary: `School reactivated · ${school.name}`,
          previous: 'Suspended',
          next: schoolStatusLabel(status, school.subscription?.status),
        },
        tx,
      );
    });
    return this.get(id);
  }

  /* ---------- Renewal reminders ---------- */

  /** Emails each school's billing contact about its renewal. Suspended schools are skipped. */
  async sendReminders(ids: string[]) {
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
    const schools = await this.prisma.school.findMany({
      where: { id: { in: unique } },
      include: { subscription: { include: { plan: true } } },
    });
    if (schools.length !== unique.length)
      throw AppException.notFound('One of the selected schools doesn’t exist.');
    let queued = 0;
    for (const school of schools) {
      const sub = school.subscription;
      const to = sub?.billingContactEmail ?? school.email;
      if (!sub || !to || school.status === 'SUSPENDED') continue;
      await this.notifications.email(to, 'renewal-reminder', {
        name: sub.billingContactName ?? school.name,
        schoolName: school.name,
        plan: sub.plan.name,
        renewsOn: formatDay(sub.renewsOn, { calendar: true }),
        amount: formatNaira(sub.priceKobo),
      });
      queued += 1;
    }
    if (queued > 0)
      await this.audit.record({
        action: 'subscription.remind',
        entity: 'Subscription',
        entityId: unique.length === 1 ? unique[0]! : `${unique.length} schools`,
        schoolId: unique.length === 1 ? unique[0] : null,
        summary: `Renewal reminders sent · ${queued} school${queued === 1 ? '' : 's'}`,
        next: `${queued} queued`,
      });
    return { queued };
  }

  /* ---------- Support sessions ---------- */

  /**
   * Opens time-boxed, read-only access to the school's portal for the signed-in staff member. The
   * school sees it in its own audit log.
   */
  async startSupportSession(id: string, reason: string, staffUserId: string) {
    const school = await this.load(id);
    if (school.status === 'SUSPENDED')
      throw AppException.conflict(
        'Reactivate the school before opening a support session.',
        'SCHOOL_SUSPENDED',
      );
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_MINUTES * 60_000);
    const session = await this.prisma.$transaction(async (tx) => {
      // One live session per person per school: starting again replaces the old one.
      await tx.supportSession.updateMany({
        where: { schoolId: id, staffUserId, endedAt: null, expiresAt: { gt: now } },
        data: { endedAt: now },
      });
      const row = await tx.supportSession.create({
        data: { schoolId: id, staffUserId, reason, mode: 'READ_ONLY', startedAt: now, expiresAt },
      });
      await this.audit.record(
        {
          action: 'support_session.start',
          entity: 'Support session',
          entityId: row.id,
          schoolId: id,
          summary: `Support session started · ${school.name} · “${reason}”`,
          next: `Read-only · ${SUPPORT_SESSION_MINUTES} min`,
        },
        tx,
      );
      return row;
    });
    return { sessionId: session.id, expiresIn: `${SUPPORT_SESSION_MINUTES} minutes` };
  }

  /* ---------- Administrators ---------- */

  async administrators(id: string) {
    await this.load(id);
    const memberships = await this.prisma.schoolMembership.findMany({
      where: { schoolId: id, ...adminMembershipsWhere },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        roles: { include: { role: { select: { key: true } } } },
        branches: { include: { branch: { select: { name: true } } } },
        invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    const now = this.clock.now();
    return memberships.map((m) => {
      const invitation = m.invitations[0];
      let note: string | undefined;
      if (m.status === 'INVITED' && invitation) {
        const days = Math.ceil((invitation.expiresAt.getTime() - now.getTime()) / DAY);
        const sent = invitation.sendCount > 1 ? 'Resent' : 'Sent';
        note =
          invitation.status === 'PENDING' && days > 0
            ? `${sent} ${formatDay(invitation.lastSentAt)} · expires in ${days} day${days === 1 ? '' : 's'}`
            : 'Invitation expired · resend it';
      }
      return {
        id: m.id,
        name: `${m.user.firstName} ${m.user.lastName}`,
        email: m.user.email ?? '',
        role: m.roles.some((r) => r.role.key === 'owner')
          ? ('Owner' as const)
          : ('School Admin' as const),
        scope:
          m.scope === 'SCHOOL'
            ? 'All branches'
            : m.branches.map((b) => b.branch.name).join(', ') || '—',
        invitedAt: formatDay(m.invitedAt ?? m.createdAt),
        status: m.status === 'ACTIVE' ? ('Active' as const) : ('Invited' as const),
        ...(note && { note }),
      };
    });
  }

  /**
   * Invites an administrator (Owner or School Admin) to the school: finds or creates their EduTrack
   * user by email, adds an invited staff membership with the role and scope, and sends the link.
   */
  async inviteAdmin(
    id: string,
    dto: InviteSchoolAdminDto,
    tx?: Prisma.TransactionClient,
  ): Promise<{ membershipId: string; invitationId: string }> {
    const db = tx ?? this.prisma;
    const school = await db.school.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!school) throw AppException.notFound(SCHOOL_NOT_FOUND);
    const [firstName, ...rest] = dto.name.split(/\s+/);
    const lastName = rest.join(' ');

    let branchId: string | null = null;
    if (dto.scope.toLowerCase() !== 'all branches') {
      const branch = await db.branch.findFirst({
        where: { schoolId: id, name: { equals: dto.scope, mode: 'insensitive' }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!branch)
        throw AppException.validation({
          scope: `${dto.scope} isn’t one of this school’s branches.`,
        });
      branchId = branch.id;
    }
    const role = await db.schoolRole.findUnique({
      where: {
        schoolId_key: { schoolId: id, key: dto.role === 'Owner' ? 'owner' : 'school_admin' },
      },
      select: { id: true },
    });
    if (!role)
      throw AppException.conflict('This school’s roles aren’t set up yet.', 'ROLES_MISSING');

    const run = async (t: Prisma.TransactionClient) => {
      const user =
        (await t.user.findUnique({ where: { email: dto.email } })) ??
        (await t.user.create({ data: { email: dto.email, firstName: firstName!, lastName } }));
      const existing = await t.schoolMembership.findUnique({
        where: { schoolId_userId_kind: { schoolId: id, userId: user.id, kind: 'STAFF' } },
        select: { id: true },
      });
      if (existing)
        throw AppException.conflict(
          `${dto.email} already has access to ${school.name}.`,
          'ALREADY_MEMBER',
        );
      const now = this.clock.now();
      const membership = await t.schoolMembership.create({
        data: {
          schoolId: id,
          userId: user.id,
          kind: 'STAFF',
          status: 'INVITED',
          scope: branchId ? 'BRANCH' : 'SCHOOL',
          invitedAt: now,
          roles: { create: { roleId: role.id } },
          ...(branchId && { branches: { create: { branchId } } }),
        },
      });
      const invitation = await t.invitation.create({
        data: {
          kind: 'SCHOOL_STAFF',
          email: dto.email,
          userId: user.id,
          schoolId: id,
          membershipId: membership.id,
          position: dto.role === 'Owner' ? 'Owner' : 'School Administrator',
          invitedById: RequestContext.get()?.userId ?? null,
          // Replaced with a real token hash when the link is sent.
          tokenHash: `pending:${membership.id}`,
          expiresAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'school_admin.invite',
          entity: 'Invitation',
          entityId: invitation.id,
          schoolId: id,
          summary: `School administrator invited · ${dto.email} · ${school.name}`,
          next: 'Pending',
        },
        t,
      );
      return { membershipId: membership.id, invitationId: invitation.id };
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async inviteAdminAndSend(id: string, dto: InviteSchoolAdminDto) {
    const { membershipId, invitationId } = await this.inviteAdmin(id, dto);
    await this.invitations.send(invitationId);
    const admins = await this.administrators(id);
    return admins.find((a) => a.id === membershipId)!;
  }

  async resendAdminInvite(id: string, membershipId: string) {
    const school = await this.load(id);
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId: id, ...adminMembershipsWhere },
      include: {
        user: { select: { firstName: true, lastName: true } },
        invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!membership) throw AppException.notFound('That administrator doesn’t exist.');
    const invitation = membership.invitations[0];
    if (membership.status !== 'INVITED' || !invitation || invitation.status === 'ACCEPTED')
      throw AppException.conflict('This administrator has already accepted.', 'INVITATION_USED');
    if (invitation.status === 'REVOKED')
      throw AppException.conflict(
        'This invitation was withdrawn. Invite them again.',
        'INVITATION_REVOKED',
      );
    await this.invitations.send(invitation.id, { resend: true });
    await this.audit.record({
      action: 'school_admin.resend',
      entity: 'Invitation',
      entityId: invitation.id,
      schoolId: id,
      summary: `Administrator invitation resent · ${membership.user.firstName} ${membership.user.lastName} · ${school.name}`,
      previous: 'Pending',
      next: 'Resent',
    });
    const admins = await this.administrators(id);
    return admins.find((a) => a.id === membershipId)!;
  }

  /* ---------- Usage, billing, history ---------- */

  async usage(id: string) {
    const school = await this.load(id);
    const now = this.clock.now();
    const week = new Date(now.getTime() - 7 * DAY);
    const month = new Date(now.getTime() - 30 * DAY);
    const fiveWeeks = new Date(now.getTime() - 35 * DAY);
    const [activeStaff, parentSignIns, smsThisWeek, smsBefore, storage] = await Promise.all([
      this.prisma.schoolMembership.count({
        where: { schoolId: id, kind: 'STAFF', status: 'ACTIVE' },
      }),
      this.prisma.schoolMembership.count({
        where: { schoolId: id, kind: 'GUARDIAN', lastActiveAt: { gte: month } },
      }),
      this.prisma.messageDelivery.count({
        where: { schoolId: id, channel: 'SMS', sentAt: { gte: week } },
      }),
      this.prisma.messageDelivery.count({
        where: { schoolId: id, channel: 'SMS', sentAt: { gte: fiveWeeks, lt: week } },
      }),
      this.prisma.storedFile.aggregate({
        where: { schoolId: id, deletedAt: null },
        _sum: { sizeBytes: true },
      }),
    ]);
    // Flag a week that is well above the school's usual volume (average of the four before it).
    const usual = smsBefore / 4;
    const ratio = usual > 0 ? smsThisWeek / usual : 0;
    const bytes = Number(storage._sum.sizeBytes ?? 0n);
    return {
      activeStaff,
      parentSignIns,
      smsSent: smsThisWeek,
      ...(smsThisWeek >= 500 &&
        ratio >= 2.5 && { smsNote: `This week · ${Math.round(ratio)}× usual volume` }),
      storageUsedGb: Math.round((bytes / 1024 ** 3) * 10) / 10,
      storageLimitGb: school.subscription?.plan.storageLimitGb ?? null,
    };
  }

  async billing(id: string) {
    await this.load(id);
    const today = lagosToday(this.clock.now());
    const invoices = await this.prisma.platformInvoice.findMany({
      where: { schoolId: id, status: { not: 'VOID' } },
      orderBy: [{ issuedOn: 'desc' }, { number: 'desc' }],
    });
    return invoices.map((inv) => ({
      id: inv.number,
      period: `${formatMonth(inv.periodStart)} – ${formatMonth(inv.periodEnd)}`,
      amount: formatNaira(inv.amountKobo),
      status:
        inv.status === 'PAID'
          ? ('Paid' as const)
          : inv.dueOn < today
            ? ('Overdue' as const)
            : ('Due' as const),
    }));
  }

  private historyWhere(id: string): Prisma.AuditEventWhereInput {
    return { OR: [{ schoolId: id }, { entityId: id }] };
  }

  async activity(id: string) {
    await this.load(id);
    const events = await this.prisma.auditEvent.findMany({
      where: this.historyWhere(id),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return events.map((e) => ({
      id: e.id,
      title: e.summary,
      detail: `by ${e.actorName ?? 'EduTrack'}`,
      when: formatDay(e.createdAt),
      tone: toneOf(e.action),
    }));
  }

  async auditLog(id: string) {
    await this.load(id);
    const events = await this.prisma.auditEvent.findMany({
      where: this.historyWhere(id),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events.map(toAuditEntry);
  }
}
