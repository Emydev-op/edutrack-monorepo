import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { AppException } from '../../common/errors/app.exception.js';
import { formatAgo } from '../../platform/shared/format.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { displayPhone } from '../guardians/family-records.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import type { ParentPreferencesDto, ParentProfileDto } from './dto/parent.dto.js';
import { guardianDisplay, ParentScopeService } from './parent-scope.service.js';

/**
 * What parents can tune, by notification category (the in-app category the school's messages
 * use). Each channel is the parent's own choice on top of the school's settings: off means that
 * channel is skipped for them. Sign-in and security emails always arrive.
 */
export const PARENT_CATEGORIES = [
  {
    key: 'results',
    label: 'Results',
    description: 'Report cards when the school publishes them.',
  },
  {
    key: 'finance',
    label: 'Fees & receipts',
    description: 'Invoices, reminders, receipts and transfers the school confirms or rejects.',
  },
  {
    key: 'assignments',
    label: 'Assignments',
    description: 'New homework and returned work with the teacher’s feedback.',
  },
  {
    key: 'register',
    label: 'Attendance',
    description: 'When your child is marked absent.',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'News and notices from the school.',
  },
] as const;

export const PARENT_CATEGORY_KEYS = new Set<string>(PARENT_CATEGORIES.map((c) => c.key));

const LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const localStamp = (d: Date) => LOCAL.format(d).replace(', ', 'T');
const isNigerianMobile = (value: string) =>
  /^\+234[789][01]\d{8}$/.test(normalizePhone(value) ?? '');

/**
 * The parent's own account: contact details (phone and address are theirs to change; the
 * sign-in email is changed by the school), notification channels per category, and their
 * notifications.
 */
@Injectable()
export class ParentAccountService {
  constructor(
    private readonly scope: ParentScopeService,
    private readonly prisma: PrismaService,
    private readonly audit: SchoolAuditService,
  ) {}

  private mine(auth: AuthUserContext) {
    return { userId: auth.userId, schoolId: auth.schoolId! };
  }

  /* ---------------- Profile ---------------- */

  async profile(auth: AuthUserContext) {
    const g = await this.scope.guardian(auth);
    const user = await this.scope.db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    return {
      name: guardianDisplay(g),
      title: g.title,
      email: user.email ?? '',
      phone: displayPhone(g.phone ?? user.phone),
      address: g.address ?? '',
      occupation: g.occupation ?? null,
      lastSignInAt: user.lastSignInAt ? localStamp(user.lastSignInAt) : null,
    };
  }

  /** Phone and address only; the school sees the change in the guardian's history. */
  async updateProfile(auth: AuthUserContext, dto: ParentProfileDto) {
    const g = await this.scope.guardian(auth);
    const changes: Record<string, string | null> = {};
    let phone: string | null | undefined;
    if (dto.phone !== undefined) {
      const raw = dto.phone.trim();
      if (!raw) throw AppException.validation({ phone: 'Enter your mobile number.' });
      if (!isNigerianMobile(raw))
        throw AppException.validation({
          phone: 'Enter a Nigerian mobile number, like 0803 412 7781.',
        });
      phone = normalizePhone(raw)!;
      if (phone !== g.phone) changes.phone = phone;
    }
    if (dto.address !== undefined) {
      const address = dto.address.trim();
      if (address.length > 300)
        throw AppException.validation({ address: 'Keep the address to 300 characters.' });
      if ((address || null) !== (g.address ?? null)) changes.address = address || null;
    }
    if (!Object.keys(changes).length) return this.profile(auth);
    if (changes.phone) {
      const taken = await this.prisma.user.findFirst({
        where: { phone: changes.phone, id: { not: auth.userId } },
        select: { id: true },
      });
      if (taken)
        throw AppException.validation({
          phone: 'This number is used by another EduTrack account. Contact the school.',
        });
    }
    await this.scope.db.$transaction(async (tx) => {
      await tx.guardian.update({ where: { id: g.id }, data: changes });
      if (changes.phone)
        await tx.user.update({ where: { id: auth.userId }, data: { phone: changes.phone } });
      const what = [
        changes.phone !== undefined && 'phone',
        changes.address !== undefined && 'address',
      ]
        .filter(Boolean)
        .join(' and ');
      await this.audit.record(
        {
          action: 'guardian.update',
          area: 'Students',
          entity: 'Guardian',
          entityId: g.id,
          summary: `Contact details updated by ${guardianDisplay(g)} (Parent Portal)`,
          detail: `Changed ${what}`,
          before: Object.fromEntries(
            Object.keys(changes).map((k) => [k, k === 'phone' ? g.phone : g.address]),
          ),
          after: changes,
        },
        asTx(tx),
      );
    });
    return this.profile(auth);
  }

  /* ---------------- Notification preferences ---------------- */

  async preferences(auth: AuthUserContext) {
    await this.scope.guardian(auth);
    const saved = await this.prisma.notificationPreference.findMany({
      where: { ...this.mine(auth), event: { in: [...PARENT_CATEGORY_KEYS] } },
    });
    return PARENT_CATEGORIES.map((c) => {
      const p = saved.find((s) => s.event === c.key);
      return {
        key: c.key,
        label: c.label,
        description: c.description,
        inApp: p?.inApp ?? true,
        email: p?.email ?? true,
        sms: p?.sms ?? true,
      };
    });
  }

  async savePreferences(auth: AuthUserContext, dto: ParentPreferencesDto) {
    await this.scope.guardian(auth);
    const { userId, schoolId } = this.mine(auth);
    for (const item of dto.items) {
      if (!PARENT_CATEGORY_KEYS.has(item.key))
        throw AppException.validation({ items: `Unknown notification type “${item.key}”.` });
      const data = { inApp: item.inApp, email: item.email, sms: item.sms };
      const existing = await this.prisma.notificationPreference.findFirst({
        where: { userId, schoolId, event: item.key },
      });
      if (existing)
        await this.prisma.notificationPreference.update({ where: { id: existing.id }, data });
      else
        await this.prisma.notificationPreference.create({
          data: { userId, schoolId, event: item.key, ...data },
        });
    }
    return this.preferences(auth);
  }

  /* ---------------- Notifications ---------------- */

  private item(n: {
    id: string;
    title: string;
    body: string;
    category: string;
    link: string | null;
    entityType: string | null;
    entityId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      category: n.category,
      to: n.link ?? '/',
      childId: n.entityType === 'Student' ? n.entityId : null,
      createdAt: localStamp(n.createdAt),
      when: formatAgo(n.createdAt, this.scope.now()),
      read: !!n.readAt,
    };
  }

  async notifications(
    auth: AuthUserContext,
    q: { filter?: string; page?: number; pageSize?: number },
  ) {
    await this.scope.guardian(auth);
    const base = this.mine(auth);
    const where = { ...base, ...(q.filter === 'unread' && { readAt: null }) };
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const [rows, matching, unread, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...base, readAt: null } }),
      this.prisma.notification.count({ where: base }),
    ]);
    return {
      rows: rows.map((n) => this.item(n)),
      meta: {
        page,
        pageSize,
        total: matching,
        totalPages: Math.max(1, Math.ceil(matching / pageSize)),
      },
      unread,
      total,
    };
  }

  async read(auth: AuthUserContext, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { ...this.mine(auth), id } });
    if (!n) throw AppException.notFound('Notification not found.', 'NOT_FOUND');
    const updated = n.readAt
      ? n
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: this.scope.now() },
        });
    return this.item(updated);
  }

  async readAll(auth: AuthUserContext) {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.mine(auth), readAt: null },
      data: { readAt: this.scope.now() },
    });
    return { marked: count };
  }
}
