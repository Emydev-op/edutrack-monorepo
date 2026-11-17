import { Injectable } from '@nestjs/common';
import { normalizePhone } from '../../auth/identifiers.js';
import {
  childAccess,
  isCurrentStudent,
  leftOnOf,
  readOnlyUntil,
} from '../../auth/school-portal-rules.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated } from '../../common/pagination/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MembershipStatus, PaymentMethod } from '../../generated/prisma/enums.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { dayMonthYear, monthYear, splitName } from '../users/access.js';
import type { GuardianPayloadDto, GuardianQueryDto } from './dto/guardians.dto.js';
import type { PortalStatus } from './dto/guardians.responses.js';
import { balances, displayPhone, placements, type Placement } from './family-records.js';

export const GUARDIAN_NOT_FOUND = 'This guardian doesn’t exist';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_MESSAGE = 'Enter a Nigerian phone number, e.g. 0803 555 0193';

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const guardianInclude = {
  membership: {
    include: {
      invitations: {
        where: { status: { in: ['PENDING', 'EXPIRED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  },
  students: {
    include: { student: { include: { paymentPlan: { select: { name: true } } } } },
    // A guardian's children by name (links added together have no meaningful order).
    orderBy: [{ student: { firstName: 'asc' } }, { student: { surname: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.GuardianInclude;

export type GuardianWithLinks = Prisma.GuardianGetPayload<{ include: typeof guardianInclude }>;

const PORTAL_LABEL: Record<MembershipStatus, PortalStatus> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Closed',
  DEACTIVATED: 'Closed',
  REVOKED: 'No account',
};

export const portalStatus = (g: { membership: { status: MembershipStatus } | null }) =>
  g.membership ? PORTAL_LABEL[g.membership.status] : ('No account' as const);

const METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

const studentName = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;

/** A guardian with no merged-away or deleted rows: what School Admin lists. */
export const LIVE_GUARDIAN = { mergedIntoId: null, deletedAt: null } as const;

/**
 * Students › Parents / Guardians: the list with possible duplicates, a guardian's page, adding a
 * guardian to children and merging two records of one person. Contract:
 * `school-admin/src/api/mock/handlers/students.ts` (Guardians).
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  async load(id: string, db: TenantTx = this.db): Promise<GuardianWithLinks> {
    const g = isUuid(id)
      ? await db.guardian.findFirst({ where: { id, ...LIVE_GUARDIAN }, include: guardianInclude })
      : null;
    if (!g) throw AppException.notFound(GUARDIAN_NOT_FOUND, 'GUARDIAN_NOT_FOUND');
    return g;
  }

  /* ---------------- Views ---------------- */

  private async context(guardians: GuardianWithLinks[]) {
    const ids = [...new Set(guardians.flatMap((g) => g.students.map((l) => l.studentId)))];
    const [places, fees] = await Promise.all([
      placements(this.db, ids),
      balances(this.db, ids, this.today()),
    ]);
    return { places, fees };
  }

  private today() {
    return new Date(`${this.clock.now().toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  toRow(g: GuardianWithLinks, ctx: Awaited<ReturnType<GuardiansService['context']>>) {
    const links = g.students.filter((l) => !l.student.deletedAt);
    return {
      id: g.id,
      name: g.fullName,
      phone: displayPhone(g.phone),
      email: g.email ?? '',
      children: links.map((l) => ({
        id: l.studentId,
        name: studentName(l.student),
        className: ctx.places.get(l.studentId)?.className ?? '',
      })),
      relationship: links[0]?.relationship ?? 'Guardian',
      paysFees: links.some((l) => l.paysFees),
      portal: portalStatus(g),
      balance: links
        .filter((l) => l.paysFees)
        .reduce((sum, l) => sum + (ctx.fees.get(l.studentId)?.balance ?? 0), 0),
    };
  }

  async row(id: string) {
    const g = await this.load(id);
    return this.toRow(g, await this.context([g]));
  }

  async list(q: GuardianQueryDto) {
    const search = (q.search ?? '').trim();
    const digits = search.replace(/\D/g, '').replace(/^0/, '');
    const where: Prisma.GuardianWhereInput = {
      ...LIVE_GUARDIAN,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          {
            students: {
              some: {
                student: {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { surname: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      }),
    };
    const [rows, total, duplicates, studentsWithoutGuardian] = await Promise.all([
      this.db.guardian.findMany({
        where,
        include: guardianInclude,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.guardian.count({ where }),
      this.duplicates(),
      this.db.student.count({
        where: {
          deletedAt: null,
          status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] },
          guardians: { none: {} },
        },
      }),
    ]);
    const ctx = await this.context(rows);
    const page = paginated(
      rows.map((g) => this.toRow(g, ctx)),
      total,
      q,
    );
    // Not a `Page`: the screen wants the duplicates and the count beside the rows and paging.
    return { data: page.data, meta: page.meta, duplicates, studentsWithoutGuardian };
  }

  /** Guardian records that share a phone number: likely the same person entered twice. */
  private async duplicates() {
    const groups = await this.db.guardian.groupBy({
      by: ['phone'],
      where: { ...LIVE_GUARDIAN, phone: { not: null } },
      having: { phone: { _count: { gt: 1 } } },
      orderBy: { phone: 'asc' },
    });
    if (!groups.length) return [];
    const rows = await this.db.guardian.findMany({
      where: { ...LIVE_GUARDIAN, phone: { in: groups.map((g) => g.phone!) } },
      include: guardianInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const ctx = await this.context(rows);
    const label = (g: GuardianWithLinks, noEmail: boolean) =>
      `${g.fullName}${g.email ? ` · ${g.email}` : noEmail ? ' · no email' : ''}`;
    return groups.flatMap(({ phone }) => {
      const same = rows.filter((r) => r.phone === phone);
      const keep =
        same.find((g) => g.membership?.status === 'ACTIVE') ??
        same.find((g) => g.email) ??
        same[0]!;
      return same
        .filter((g) => g !== keep)
        .map((merge) => ({
          keepId: keep.id,
          keepLabel: label(keep, false),
          mergeId: merge.id,
          mergeLabel: label(merge, true),
          reason: `“${keep.fullName}” and “${merge.fullName}” share the phone number ${displayPhone(phone)}.`,
          children: [...keep.students, ...merge.students]
            .filter((l, i, all) => all.findIndex((x) => x.studentId === l.studentId) === i)
            .map((l) => {
              const cls = ctx.places.get(l.studentId)?.className;
              return `${studentName(l.student)}${cls ? ` (${cls})` : ''}`;
            })
            .join(', '),
        }));
    });
  }

  async detail(id: string) {
    const g = await this.load(id);
    const ctx = await this.context([g]);
    const now = this.clock.now();
    const links = g.students.filter((l) => !l.student.deletedAt);
    const plan = links.find((l) => l.student.paymentPlan)?.student;
    const invitation = g.membership?.status === 'INVITED' ? g.membership.invitations[0] : undefined;
    const active = g.membership?.status === 'ACTIVE';
    const email = !!g.email && !g.emailOptedOutAt;
    const sms = !!g.phone;
    const channels = (...list: [boolean, string][]) =>
      list
        .filter(([on]) => on)
        .map(([, name]) => name)
        .join(' · ') || 'None';
    return {
      ...this.toRow(g, ctx),
      address: g.address ?? '',
      occupation: g.occupation ?? '',
      portalSince:
        active && g.membership?.activatedAt ? monthYear(g.membership.activatedAt, now) : '',
      childrenDetail: links.map((l) => this.childDetail(l, ctx.places.get(l.studentId), ctx, now)),
      paymentPlan: plan ? `${plan.firstName}: ${plan.paymentPlan!.name}` : 'Full payment each term',
      preferredMethod: g.preferredPaymentMethod
        ? METHOD_LABEL[g.preferredPaymentMethod]
        : 'Not set',
      notifications: [
        ['Results', channels([active, 'In-app'], [!!g.email, 'Email'])],
        [
          'Fees & receipts',
          channels(
            [active, 'In-app'],
            [!!g.email, 'Email'],
            [sms && !g.smsFeeRemindersOptedOutAt, 'SMS'],
          ),
        ],
        ['Announcements', channels([active, 'In-app'], [email, 'Email'], [sms, 'SMS'])],
      ] as [string, string][],
      invitation: invitation
        ? {
            sentBy: [invitation.phone && 'SMS', invitation.email && 'email']
              .filter(Boolean)
              .join(' and ')
              .replace(/^e/, 'E'),
            sentOn: dayMonthYear(invitation.lastSentAt, now),
            expiresOn: DATE.format(invitation.expiresAt),
            expired: invitation.status === 'EXPIRED' || invitation.expiresAt <= now,
          }
        : null,
    };
  }

  private childDetail(
    l: GuardianWithLinks['students'][number],
    place: Placement | undefined,
    ctx: Awaited<ReturnType<GuardiansService['context']>>,
    now: Date,
  ) {
    const fee = ctx.fees.get(l.studentId);
    const current = isCurrentStudent(l.student);
    const left = current ? null : leftOnOf(l.student);
    const access = childAccess(l.student, now);
    const note = left
      ? `Left on ${DATE.format(left)} · ${
          access
            ? `parent can view past records until ${DATE.format(readOnlyUntil(left))}`
            : 'parent access has ended'
        }`
      : '';
    return {
      id: l.studentId,
      name: studentName(l.student),
      className: place?.className ?? '',
      branch: place?.branchName ?? '',
      balance: fee?.balance ?? 0,
      status: !current
        ? 'Left'
        : !fee?.balance
          ? 'Paid'
          : fee.overdue
            ? 'Overdue'
            : 'Partially paid',
      relationship: `${l.relationship}${l.paysFees ? ' · pays fees' : ''}`,
      note,
    };
  }

  /* ---------------- Add ---------------- */

  /** Adds a guardian to one or more children. Returns the new id; invite separately if asked. */
  async add(dto: GuardianPayloadDto): Promise<string> {
    const schoolId = RequestContext.schoolId()!;
    const name = (dto.name ?? '').trim();
    if (!name)
      throw AppException.validation(
        { name: 'Enter the guardian’s full name.' },
        'Enter the guardian’s full name.',
      );
    const phone = normalizePhone(dto.phone ?? '');
    if (!phone) throw AppException.validation({ phone: PHONE_MESSAGE }, PHONE_MESSAGE);
    const email = (dto.email ?? '').trim().toLowerCase() || null;
    if (email && !EMAIL.test(email))
      throw AppException.validation({ email: 'Enter a valid email.' }, 'Enter a valid email.');
    const clash = await this.db.guardian.findFirst({
      where: { ...LIVE_GUARDIAN, OR: [{ phone }, ...(email ? [{ email }] : [])] },
    });
    if (clash)
      throw AppException.conflict(
        `${clash.fullName} already uses this phone number or email. Open their record and link the child there.`,
        'GUARDIAN_EXISTS',
      );
    const ids = [...new Set(dto.studentIds ?? [])];
    if (!ids.length)
      throw AppException.validation(
        { studentIds: 'Choose at least one child.' },
        'Choose at least one child.',
      );
    const students = ids.every(isUuid)
      ? await this.db.student.findMany({
          where: {
            id: { in: ids },
            deletedAt: null,
            status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] },
          },
          include: { _count: { select: { guardians: true } } },
        })
      : [];
    if (students.length !== ids.length)
      throw AppException.validation(
        { studentIds: 'Choose children who are at the school.' },
        'Choose children who are at the school.',
      );

    const { title } = splitName(name);
    return this.db.$transaction(async (tx) => {
      const g = await tx.guardian.create({
        data: { schoolId, title, fullName: name, phone, email },
      });
      for (const s of students)
        await tx.studentGuardian.create({
          data: {
            schoolId,
            studentId: s.id,
            guardianId: g.id,
            relationship: dto.relationship,
            paysFees: dto.paysFees,
            isPrimary: s._count.guardians === 0,
          },
        });
      // A student admitted without a guardian is complete once one is linked.
      await tx.student.updateMany({
        where: { id: { in: ids }, status: 'INCOMPLETE_PROFILE' },
        data: { status: 'ACTIVE' },
      });
      await this.audit.record(
        {
          action: 'guardian.create',
          area: 'Students',
          entity: 'Guardian',
          entityId: g.id,
          summary: `${name} added as ${dto.relationship.toLowerCase()} of ${students.map(studentName).join(', ')}`,
          detail: dto.paysFees ? 'Pays fees' : null,
          after: { name, phone, email, relationship: dto.relationship, students: ids },
        },
        asTx(tx),
      );
      return g.id;
    });
  }

  /* ---------------- Merge ---------------- */

  /**
   * Merges a duplicate into the kept record: children, payments and messages move over, blank
   * contact details are filled in, the better portal account survives, and the duplicate is kept
   * for history with `mergedIntoId` set.
   */
  async merge(
    keepId: string,
    mergeId: string,
  ): Promise<{ id: string; endedUserId: string | null }> {
    if (!isUuid(keepId) || !isUuid(mergeId) || keepId === mergeId)
      throw AppException.validation(
        { mergeId: 'Choose two different guardian records.' },
        'Choose two different guardian records.',
      );
    const found = await this.db.guardian.findMany({
      where: { id: { in: [keepId, mergeId] }, ...LIVE_GUARDIAN },
      include: guardianInclude,
    });
    const keep = found.find((g) => g.id === keepId);
    const dup = found.find((g) => g.id === mergeId);
    if (!keep || !dup)
      throw AppException.validation(
        { mergeId: 'Choose two different guardian records.' },
        'Choose two different guardian records.',
      );
    const now = this.clock.now();

    return this.db.$transaction(async (tx) => {
      const keptStudents = new Map(keep.students.map((l) => [l.studentId, l]));
      for (const link of dup.students) {
        const kept = keptStudents.get(link.studentId);
        if (!kept) {
          await tx.studentGuardian.update({
            where: { id: link.id },
            data: { guardianId: keep.id },
          });
          continue;
        }
        await tx.studentGuardian.delete({ where: { id: link.id } });
        await tx.studentGuardian.update({
          where: { id: kept.id },
          data: {
            paysFees: kept.paysFees || link.paysFees,
            isPrimary: kept.isPrimary || link.isPrimary,
          },
        });
      }
      await tx.payment.updateMany({
        where: { claimedByGuardianId: dup.id },
        data: { claimedByGuardianId: keep.id },
      });
      await tx.messageRecipient.updateMany({
        where: { guardianId: dup.id },
        data: { guardianId: keep.id },
      });

      // The portal account: an active one wins; otherwise the kept record's.
      let endedUserId: string | null = null;
      const km = keep.membership;
      const dm = dup.membership;
      if (dm && dm.status !== 'REVOKED') {
        if (!km || (dm.status === 'ACTIVE' && km.status !== 'ACTIVE')) {
          // An unaccepted or closed account on the kept record makes way for the duplicate's.
          if (km) await tx.schoolMembership.delete({ where: { id: km.id } });
          await tx.schoolMembership.update({ where: { id: dm.id }, data: { guardianId: keep.id } });
        } else {
          await tx.invitation.updateMany({
            where: { membershipId: dm.id, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { status: 'REVOKED', revokedAt: now },
          });
          await tx.schoolMembership.update({
            where: { id: dm.id },
            data: {
              status: dm.status === 'INVITED' ? 'REVOKED' : 'DEACTIVATED',
              statusReason: `Merged into ${keep.fullName}’s record.`,
            },
          });
          if (dm.status === 'ACTIVE') endedUserId = dm.userId;
        }
      }

      await tx.guardian.update({
        where: { id: keep.id },
        data: {
          title: keep.title ?? dup.title,
          email: keep.email ?? dup.email,
          address: keep.address ?? dup.address,
          occupation: keep.occupation ?? dup.occupation,
          preferredPaymentMethod: keep.preferredPaymentMethod ?? dup.preferredPaymentMethod,
          contactConsentAt: keep.contactConsentAt ?? dup.contactConsentAt,
          contactConsentSource: keep.contactConsentSource ?? dup.contactConsentSource,
        },
      });
      await tx.guardian.update({ where: { id: dup.id }, data: { mergedIntoId: keep.id } });
      await this.audit.record(
        {
          action: 'guardian.merge',
          area: 'Students',
          entity: 'Guardian',
          entityId: keep.id,
          summary: `${dup.fullName} merged into ${keep.fullName}`,
          detail: `${dup.students.length} child link${dup.students.length === 1 ? '' : 's'} moved`,
          before: { kept: keep.id, merged: dup.id, mergedName: dup.fullName },
          after: { mergedIntoId: keep.id },
        },
        asTx(tx),
      );
      return { id: keep.id, endedUserId };
    });
  }
}
