import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { InvoiceStatus } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { MemberPermissions } from '../students/member-permissions.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { loadFinance } from './finance-data.js';
import { stamp } from './finance-format.js';
import { FinView, type TimelineEntry } from './finance-view.js';

/** A line in a finance record's history (and the school's audit trail). */
export interface FinLog {
  /** Record type: Invoice, Payment, Refund, Expense, Vendor, FeeStructure, BankAccount… */
  entity: string;
  entityId?: string | null;
  /** Dotted verb: invoice.issue, payment.verify… */
  action: string;
  /** The timeline title ("Payment ₦50,000 confirmed"). */
  title: string;
  /** Second line after the actor's name. */
  detail?: string | null;
  tone?: TimelineEntry['tone'];
}

export type NumberKind = 'invoice' | 'receipt' | 'refund' | 'transfer' | 'expense';

/**
 * What every finance service shares: the per-request view (snapshot + ledger), who may change
 * finance, document numbering, keeping invoices' stored money columns in step with their rows,
 * and record history (audit events, area "Finance").
 *
 * Finance is school-wide: section admins (who manage only some sections) can look but not change
 * it. Writes also need the route's finance permission and an active subscription (both checked
 * before the handler runs).
 */
@Injectable()
export class FinanceCore {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly clock: Clock,
    private readonly sections: SectionAccessService,
    private readonly perms: MemberPermissions,
  ) {}

  get db() {
    return this.tenant.db;
  }

  schoolId(): string {
    const id = RequestContext.schoolId();
    if (!id) throw AppException.forbidden();
    return id;
  }

  userId(): string | null {
    return RequestContext.get()?.userId ?? null;
  }

  now() {
    return this.clock.now();
  }

  async actorName(db: TenantTx = this.db): Promise<string> {
    const id = this.userId();
    if (!id) return 'EduTrack';
    const u = await db.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });
    return u ? `${u.firstName} ${u.lastName}` : 'EduTrack';
  }

  /** The school's finance as the screens see it, for this request. */
  async load(db: TenantTx = this.db): Promise<FinView> {
    const [fin, actor] = await Promise.all([
      loadFinance(db, this.schoolId(), this.now()),
      this.actorName(db),
    ]);
    return new FinView(fin, actor);
  }

  /* ---------------- Who may change finance ---------------- */

  /** 403 for section admins: finance is school-wide. */
  async requireWholeSchool() {
    await this.sections.require(null, 'finance');
  }

  /** Role keys of the signed-in member (principal, bursar, owner…). */
  async roleKeys(): Promise<Set<string>> {
    const ctx = RequestContext.get();
    if (!ctx?.membershipId) return new Set();
    const m = await this.db.schoolMembership.findFirst({
      where: { id: ctx.membershipId },
      select: { roles: { select: { role: { select: { key: true, archivedAt: true } } } } },
    });
    return new Set(
      (m?.roles ?? []).filter((r) => !r.role.archivedAt && r.role.key).map((r) => r.role.key!),
    );
  }

  get permissions() {
    return this.perms;
  }

  /* ---------------- Transactions ---------------- */

  /** Runs a finance write: whole-school admins only, in one transaction. */
  async write<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    await this.requireWholeSchool();
    return this.db.$transaction((tx) => fn(tx as unknown as TenantTx), { timeout: 60_000 });
  }

  /* ---------------- Numbering ---------------- */

  /**
   * The next document number, `PREFIX-YYYY-0001` (refunds three digits). Serialised per school and
   * kind with an advisory lock held until the transaction ends.
   */
  async nextNumber(tx: TenantTx, kind: NumberKind, prefix: string, year: string): Promise<string> {
    const schoolId = this.schoolId();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${kind}`}))`;
    const start = `${prefix}-${year}-`;
    const width = kind === 'refund' ? 3 : 4;
    const where = { number: { startsWith: start } };
    const select = { number: true } as const;
    const rows: { number: string }[] =
      kind === 'invoice'
        ? await tx.invoice.findMany({ where, select })
        : kind === 'receipt'
          ? await tx.payment.findMany({ where, select })
          : kind === 'refund'
            ? await tx.refund.findMany({ where, select })
            : kind === 'transfer'
              ? await tx.accountTransfer.findMany({ where, select })
              : await tx.expense.findMany({ where, select });
    const max = Math.max(
      0,
      ...rows.map((r) => Number(r.number.slice(start.length))).filter(Number.isFinite),
    );
    return `${start}${String(max + 1).padStart(width, '0')}`;
  }

  /* ---------------- Stored money columns ---------------- */

  /**
   * Recomputes invoices' subtotal, discount, total, paid (confirmed allocations plus applied
   * credit, capped at the total) and stored status (Issued · Partially paid · Paid), so balances
   * read elsewhere (students, guardians, promotion, report-card holds) match the ledger.
   */
  async syncInvoices(tx: TenantTx, ids: Iterable<string>) {
    const list = [...new Set(ids)];
    if (!list.length) return;
    const rows = await tx.invoice.findMany({
      where: { id: { in: list } },
      include: {
        lines: { select: { amountKobo: true } },
        discounts: { select: { amountKobo: true } },
        allocations: { select: { amountKobo: true, payment: { select: { status: true } } } },
        creditApplications: { select: { amountKobo: true } },
      },
    });
    for (const inv of rows) {
      const subtotal = inv.lines.reduce((a, l) => a + l.amountKobo, 0n);
      const discount = inv.discounts.reduce((a, d) => a + d.amountKobo, 0n);
      const total = subtotal > discount ? subtotal - discount : 0n;
      const received =
        inv.allocations
          .filter((a) => a.payment.status === 'CONFIRMED')
          .reduce((a, x) => a + x.amountKobo, 0n) +
        inv.creditApplications.reduce((a, c) => a + c.amountKobo, 0n);
      const live = inv.status !== 'DRAFT' && inv.status !== 'CANCELLED';
      const paid = !live ? 0n : received < total ? received : total;
      const status: InvoiceStatus = !live
        ? inv.status
        : paid >= total
          ? 'PAID'
          : paid > 0n
            ? 'PARTIALLY_PAID'
            : 'ISSUED';
      if (
        inv.subtotalKobo !== subtotal ||
        inv.discountKobo !== discount ||
        inv.totalKobo !== total ||
        inv.paidKobo !== paid ||
        inv.status !== status
      )
        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            subtotalKobo: subtotal,
            discountKobo: discount,
            totalKobo: total,
            paidKobo: paid,
            status,
          },
        });
    }
  }

  /** Every non-cancelled invoice of these students (after money moved on their account). */
  async syncStudents(tx: TenantTx, studentIds: Iterable<string>) {
    const ids = [...new Set(studentIds)];
    if (!ids.length) return;
    const rows = await tx.invoice.findMany({
      where: { studentId: { in: ids } },
      select: { id: true },
    });
    await this.syncInvoices(
      tx,
      rows.map((r) => r.id),
    );
  }

  /* ---------------- History ---------------- */

  /** Records finance events (one per record) in the audit trail, in the caller's transaction. */
  async log(tx: TenantTx, entries: FinLog[]) {
    if (!entries.length) return;
    const ctx = RequestContext.get();
    const actorName = await this.actorName(tx);
    const at = this.now();
    await tx.auditEvent.createMany({
      data: entries.map((e, i) => ({
        schoolId: this.schoolId(),
        actorKind: ctx?.supportSessionId ? 'PLATFORM_STAFF' : ctx?.userId ? 'USER' : 'SYSTEM',
        actorUserId: ctx?.userId ?? null,
        actorName,
        action: e.action,
        area: 'Finance',
        entityType: e.entity,
        entityId: e.entityId ?? null,
        summary: e.title,
        detail: e.detail ?? null,
        after: { tone: e.tone ?? 'info' } as Prisma.InputJsonValue,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
        supportSessionId: ctx?.supportSessionId ?? null,
        // Keep the order of events written together.
        createdAt: new Date(at.getTime() + i),
      })),
    });
  }

  /** A record's history, newest first, as the screens' timelines show it. */
  async history(entity: string, entityId: string): Promise<TimelineEntry[]> {
    const events = await this.db.auditEvent.findMany({
      where: { entityType: entity, entityId, area: 'Finance' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events.map((e) => {
      const tone = (e.after as { tone?: TimelineEntry['tone'] } | null)?.tone ?? 'info';
      return {
        id: e.id,
        title: e.summary,
        detail: [e.actorName ?? 'EduTrack', e.detail].filter(Boolean).join(' · '),
        when: stamp(e.createdAt),
        tone,
      };
    });
  }
}
