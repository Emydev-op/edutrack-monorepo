import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SenderIdStatus, SmsCreditKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type Db = Prisma.TransactionClient;

/** What SMS goes out as until a school's own sender ID is approved. */
export const DEFAULT_SENDER = 'EDUTRACK';
export const SENDER_STATUS: Record<SenderIdStatus, string> = {
  NOT_REQUESTED: 'Not requested',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** Below this the screens warn that SMS units are running low. */
export const LOW_UNITS = 2000;

export interface LedgerEntry {
  kind: SmsCreditKind;
  /** Signed: positive adds units, negative uses them. */
  units: number;
  termId?: string | null;
  messageId?: string | null;
  reference?: string | null;
  note?: string;
  createdById?: string | null;
}

/**
 * A school's prepaid SMS units. Every change is a row in the append-only ledger
 * (`SmsCreditTransaction`): the plan's allowance each term, top-ups EduTrack records, units each
 * SMS page uses and units given back when a send fails. `CommunicationSettings.smsBalanceUnits`
 * is the running balance, updated in the same transaction under a row lock so two sends can't
 * spend the same units. Works for both sides of the API: callers pass the client (the school's
 * tenant transaction, or `PrismaService` in the back office) and the school id.
 */
@Injectable()
export class SmsLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** The school's communication settings, created with the defaults the first time. */
  settings(db: Db, schoolId: string) {
    return db.communicationSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
  }

  /** The settings without writing (reads also run in read-only support sessions). */
  async read(db: Db, schoolId: string) {
    const row = await db.communicationSettings.findUnique({ where: { schoolId } });
    return (
      row ?? {
        schoolId,
        quietHoursEnabled: true,
        quietHoursStart: new Date('1970-01-01T21:00:00.000Z'),
        quietHoursEnd: new Date('1970-01-01T07:00:00.000Z'),
        senderId: null,
        senderIdStatus: 'NOT_REQUESTED' as const,
        smsBalanceUnits: 0,
        lowCreditNotifiedAt: null,
        createdAt: this.clock.now(),
        updatedAt: this.clock.now(),
      }
    );
  }

  /** Locks the balance until the transaction ends; returns the settings row. */
  async lock(db: Db, schoolId: string) {
    await this.settings(db, schoolId);
    await db.$queryRaw`SELECT 1 FROM communication_settings WHERE school_id = ${schoolId}::uuid FOR UPDATE`;
    return db.communicationSettings.findUniqueOrThrow({ where: { schoolId } });
  }

  /** Adds a ledger row and moves the balance. Call inside a transaction (it locks). */
  async post(db: Db, schoolId: string, entry: LedgerEntry) {
    await this.lock(db, schoolId);
    await db.smsCreditTransaction.create({
      data: {
        schoolId,
        kind: entry.kind,
        units: entry.units,
        termId: entry.termId ?? null,
        messageId: entry.messageId ?? null,
        reference: entry.reference ?? null,
        note: entry.note ?? '',
        createdById: entry.createdById ?? null,
        createdAt: this.clock.now(),
      },
    });
    return db.communicationSettings.update({
      where: { schoolId },
      data: { smsBalanceUnits: { increment: entry.units } },
    });
  }

  /** The term SMS use is counted against: the active one, else the current session's first. */
  async currentTermId(db: Db, schoolId: string): Promise<string | null> {
    const active = await db.term.findFirst({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (active) return active.id;
    const session =
      (await db.academicSession.findFirst({ where: { schoolId, status: 'ACTIVE' } })) ??
      (await db.academicSession.findFirst({
        where: { schoolId, status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
      }));
    if (!session) return null;
    const first = await db.term.findFirst({
      where: { schoolId, sessionId: session.id },
      orderBy: { sequence: 'asc' },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  /**
   * Credits the plan's SMS allowance for the current term, once per term. Runs in its own
   * transaction (call it before opening one that sends).
   */
  async addTermAllowance(schoolId: string) {
    const termId = await this.currentTermId(this.prisma, schoolId);
    if (!termId) return;
    const given = await this.prisma.smsCreditTransaction.count({
      where: { schoolId, termId, kind: 'PLAN_ALLOWANCE' },
    });
    if (given) return;
    const sub = await this.prisma.subscription.findUnique({
      where: { schoolId },
      select: { plan: { select: { name: true, smsCreditsPerTerm: true } } },
    });
    const units = sub?.plan.smsCreditsPerTerm ?? 0;
    if (units <= 0) return;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, schoolId);
      // Re-checked under the lock: another request may have just added it.
      if (
        await tx.smsCreditTransaction.count({ where: { schoolId, termId, kind: 'PLAN_ALLOWANCE' } })
      )
        return;
      await this.post(tx, schoolId, {
        kind: 'PLAN_ALLOWANCE',
        units,
        termId,
        note: `${sub!.plan.name} plan · SMS units for the term`,
      });
    });
  }

  /** Units used this term (pages sent less units given back). */
  async usedThisTerm(db: Db, schoolId: string, termId: string | null) {
    if (!termId) return 0;
    const sum = await db.smsCreditTransaction.aggregate({
      where: { schoolId, termId, kind: { in: ['USAGE', 'REFUND'] } },
      _sum: { units: true },
    });
    return Math.max(0, -(sum._sum.units ?? 0));
  }

  /** What SMS goes out as: the school's approved sender ID, else EduTrack's. */
  async sender(db: Db, schoolId: string) {
    const s = await this.read(db, schoolId);
    if (s.senderIdStatus === 'APPROVED' && s.senderId) return s.senderId;
    // A new name waiting for approval: the one approved before stays in use.
    const approved = await db.senderIdRequest.findFirst({
      where: { schoolId, status: 'APPROVED' },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      select: { name: true },
    });
    return approved?.name ?? DEFAULT_SENDER;
  }
}
