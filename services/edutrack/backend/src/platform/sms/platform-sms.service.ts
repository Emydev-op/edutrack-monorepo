import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SmsCreditKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SENDER_STATUS, SmsLedgerService } from '../../school/communication/sms-ledger.service.js';
import { formatStamp } from '../shared/format.js';
import { SCHOOL_NOT_FOUND } from '../shared/params.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import type { SenderIdDecisionDto, SmsTopUpDto } from './platform-sms.dto.js';

const KIND_LABEL: Record<SmsCreditKind, string> = {
  PLAN_ALLOWANCE: 'Plan allowance',
  PURCHASE: 'Top-up',
  USAGE: 'Used',
  REFUND: 'Returned',
  ADJUSTMENT: 'Adjustment',
};

const units = (n: number) => `${n.toLocaleString('en-NG')} SMS unit${n === 1 ? '' : 's'}`;

/**
 * The back office's side of a school's SMS: its units (balance, ledger, top-ups EduTrack records
 * after the school pays) and its sender ID requests, which EduTrack approves or rejects once the
 * networks have registered the name. The school's admins are told in School Admin.
 */
@Injectable()
export class PlatformSmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: SmsLedgerService,
    private readonly audit: PlatformAuditService,
    private readonly clock: Clock,
  ) {}

  private async school(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        subscription: { select: { plan: { select: { name: true, smsCreditsPerTerm: true } } } },
      },
    });
    if (!school) throw AppException.notFound(SCHOOL_NOT_FOUND);
    return school;
  }

  private async names(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    const users = wanted.length
      ? await this.prisma.user.findMany({
          where: { id: { in: wanted } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  /** Balance, this term's use, sender ID requests and the latest ledger lines. */
  async view(schoolId: string) {
    const school = await this.school(schoolId);
    await this.ledger.addTermAllowance(schoolId);
    const termId = await this.ledger.currentTermId(this.prisma, schoolId);
    const [settings, sender, used, requests, lines] = await Promise.all([
      this.ledger.read(this.prisma, schoolId),
      this.ledger.sender(this.prisma, schoolId),
      this.ledger.usedThisTerm(this.prisma, schoolId, termId),
      this.prisma.senderIdRequest.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      this.prisma.smsCreditTransaction.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        include: { message: { select: { title: true } } },
      }),
    ]);
    const names = await this.names([
      ...requests.map((r) => r.requestedById),
      ...lines.map((l) => l.createdById),
    ]);
    return {
      school: school.name,
      plan: school.subscription?.plan.name ?? '',
      allowancePerTerm: school.subscription?.plan.smsCreditsPerTerm ?? 0,
      balance: settings.smsBalanceUnits,
      usedThisTerm: used,
      sender,
      senderId: { name: settings.senderId ?? '', status: SENDER_STATUS[settings.senderIdStatus] },
      requests: requests.map((r) => ({
        id: r.id,
        name: r.name,
        status: SENDER_STATUS[r.status],
        requestedAt: formatStamp(r.createdAt),
        requestedBy: names.get(r.requestedById ?? '') ?? '',
        decidedAt: r.decidedAt ? formatStamp(r.decidedAt) : null,
        note: r.note,
      })),
      ledger: lines.map((l) => ({
        id: l.id,
        at: formatStamp(l.createdAt),
        kind: KIND_LABEL[l.kind],
        units: l.units,
        detail: [l.message?.title, l.note, l.reference].filter(Boolean).join(' · '),
        by: l.createdById ? (names.get(l.createdById) ?? '') : 'EduTrack',
      })),
    };
  }

  /** Pending (or all) sender ID requests across schools, oldest first. */
  async queue(status: 'pending' | 'all' = 'pending') {
    const rows = await this.prisma.senderIdRequest.findMany({
      where: status === 'pending' ? { status: 'PENDING_APPROVAL' } : {},
      orderBy: [
        { createdAt: status === 'pending' ? 'asc' : 'desc' },
        { id: status === 'pending' ? 'asc' : 'desc' },
      ],
      take: 200,
      include: { school: { select: { id: true, name: true } } },
    });
    const names = await this.names(rows.map((r) => r.requestedById));
    return rows.map((r) => ({
      id: r.id,
      schoolId: r.school.id,
      school: r.school.name,
      name: r.name,
      status: SENDER_STATUS[r.status],
      requestedAt: formatStamp(r.createdAt),
      requestedBy: names.get(r.requestedById ?? '') ?? '',
      note: r.note,
    }));
  }

  async topUp(auth: AuthUserContext, schoolId: string, dto: SmsTopUpDto) {
    const school = await this.school(schoolId);
    await this.prisma.$transaction(async (tx) => {
      const before = (await this.ledger.lock(tx, schoolId)).smsBalanceUnits;
      const after = await this.ledger.post(tx, schoolId, {
        kind: 'PURCHASE',
        units: dto.units,
        termId: await this.ledger.currentTermId(tx, schoolId),
        reference: dto.reference || null,
        note: dto.note,
        createdById: auth.userId,
      });
      await this.audit.record(
        {
          action: 'sms.top_up',
          entity: 'School',
          entityId: schoolId,
          schoolId,
          summary: `Added ${units(dto.units)} to ${school.name}`,
          previous: String(before),
          next: String(after.smsBalanceUnits),
          after: { units: dto.units, reference: dto.reference ?? null, note: dto.note },
        },
        tx,
      );
      await this.notifySchool(tx, schoolId, null, {
        title: `${units(dto.units)} added`,
        body: `EduTrack topped up your SMS units. Balance: ${after.smsBalanceUnits.toLocaleString('en-NG')}. SMS that wasn’t sent for lack of units can be retried in Delivery logs.`,
        link: '/communication/delivery-logs',
      });
    });
    return this.view(schoolId);
  }

  async decide(schoolId: string, approve: boolean, dto: SenderIdDecisionDto) {
    const school = await this.school(schoolId);
    const note = (dto.note ?? '').trim();
    if (!approve && !note)
      throw AppException.validation({ note: 'Say why, so the school knows what to change.' });
    const request = await this.prisma.senderIdRequest.findFirst({
      where: { schoolId, status: 'PENDING_APPROVAL' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!request)
      throw new AppException(
        HttpStatus.CONFLICT,
        `${school.name} has no sender ID waiting for approval.`,
        'NO_PENDING_SENDER_ID',
      );
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.senderIdRequest.update({
        where: { id: request.id },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decidedAt: now,
          note: note || (approve ? 'Approved by EduTrack.' : ''),
        },
      });
      await this.ledger.settings(tx, schoolId);
      await tx.communicationSettings.update({
        where: { schoolId },
        data: { senderId: request.name, senderIdStatus: approve ? 'APPROVED' : 'REJECTED' },
      });
      await this.audit.record(
        {
          action: approve ? 'sender_id.approve' : 'sender_id.reject',
          entity: 'School',
          entityId: schoolId,
          schoolId,
          summary: `${approve ? 'Approved' : 'Rejected'} sender ID “${request.name}” for ${school.name}`,
          next: request.name,
          ...(note && { after: { note } }),
        },
        tx,
      );
      await this.notifySchool(tx, schoolId, request.requestedById, {
        title: approve
          ? `Sender ID “${request.name}” approved`
          : `Sender ID “${request.name}” not approved`,
        body: approve
          ? `SMS now goes out as ${request.name}.`
          : `${note} SMS keeps going out as the sender you have now. Request a different name in Settings → Notifications.`,
        link: '/settings?tab=notifications',
      });
    });
    return this.view(schoolId);
  }

  /** In-app notice for the school's admins (and whoever asked, if they aren't one). */
  private async notifySchool(
    tx: Prisma.TransactionClient,
    schoolId: string,
    requesterId: string | null,
    n: { title: string; body: string; link: string },
  ) {
    const admins = await tx.schoolMembership.findMany({
      where: {
        schoolId,
        kind: 'STAFF',
        status: 'ACTIVE',
        roles: { some: { role: { key: { in: ['owner', 'school_admin'] }, archivedAt: null } } },
      },
      select: { userId: true },
    });
    const people = new Set(admins.map((a) => a.userId));
    if (requesterId) people.add(requesterId);
    if (!people.size) return;
    await tx.notification.createMany({
      data: [...people].map((userId) => ({
        userId,
        schoolId,
        category: 'communication',
        title: n.title,
        body: n.body,
        link: n.link,
        entityType: 'School',
        entityId: schoolId,
        createdAt: this.clock.now(),
      })),
    });
  }
}
