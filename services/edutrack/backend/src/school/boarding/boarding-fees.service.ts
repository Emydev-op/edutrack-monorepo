import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { lagosToday } from '../../platform/shared/format.js';
import { FinanceCore } from '../finance/finance-core.service.js';
import type { TenantTx } from '../shared/tenant-tx.js';

/** A day student who stopped boarding this early in the term no longer pays this term's boarding. */
export const BOARDING_REFUND_DAYS = 14;

const naira = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString('en-NG')}`;

export interface BoardingFeeChange {
  change: 'added' | 'removed' | 'kept' | 'none';
  /** In naira. */
  amount: number;
  note: string | null;
}

/**
 * Boarding fees on the current term's invoice when a student's boarding changes mid-term, so a
 * family can't dodge a term's boarding by switching after invoices go out:
 * - becoming a boarder adds this term's boarding items (those for boarders, by gender) at the
 *   class's published amounts;
 * - becoming a day student removes them only in the term's first two weeks; after that they stay
 *   and Finance can adjust the invoice.
 * Students with no invoice yet are billed correctly when invoices are generated.
 */
@Injectable()
export class BoardingFeesService {
  constructor(
    private readonly core: FinanceCore,
    private readonly clock: Clock,
  ) {}

  async apply(
    tx: TenantTx,
    e: { studentId: string; sessionId: string; branchId: string; levelId: string },
    gender: 'MALE' | 'FEMALE',
    boarding: boolean,
  ): Promise<BoardingFeeChange> {
    const term = await tx.term.findFirst({
      where: { sessionId: e.sessionId, status: 'ACTIVE' },
      select: { id: true, name: true, startsOn: true, sequence: true },
    });
    if (!term) return { change: 'none', amount: 0, note: null };
    const invoice = await tx.invoice.findFirst({
      where: {
        studentId: e.studentId,
        termId: term.id,
        kind: 'TERM_FEES',
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      include: { lines: { include: { feeItem: { select: { appliesTo: true } } } } },
    });
    const draft = invoice
      ? null
      : await tx.invoice.findFirst({
          where: { studentId: e.studentId, termId: term.id, kind: 'TERM_FEES', status: 'DRAFT' },
          include: { lines: { include: { feeItem: { select: { appliesTo: true } } } } },
        });
    const inv = invoice ?? draft;
    if (!inv)
      return {
        change: 'none',
        amount: 0,
        note: boarding
          ? `No ${term.name} invoice yet: boarding fees will be on it when invoices are generated.`
          : null,
      };
    const audiences = ['BOARDERS', gender === 'MALE' ? 'BOY_BOARDERS' : 'GIRL_BOARDERS'] as const;
    if (boarding) {
      const structure = await tx.feeStructure.findFirst({
        where: { termId: term.id, branchId: e.branchId, status: 'PUBLISHED' },
        include: {
          amounts: {
            where: { levelId: e.levelId },
            include: { feeItem: true },
          },
        },
      });
      const isFirst = term.sequence === 1;
      const add = (structure?.amounts ?? []).filter(
        (a) =>
          a.amountKobo > 0n &&
          a.feeItem.status === 'ACTIVE' &&
          a.feeItem.type === 'COMPULSORY' &&
          (audiences as readonly string[]).includes(a.feeItem.appliesTo) &&
          (a.feeItem.charged === 'EVERY_TERM' ||
            (a.feeItem.charged === 'ONCE_A_SESSION' && isFirst)) &&
          !inv.lines.some((l) => l.feeItemId === a.feeItemId),
      );
      if (!add.length)
        return {
          change: 'none',
          amount: 0,
          note: 'No boarding fees are set for this class this term.',
        };
      await tx.invoiceLine.createMany({
        data: add.map((a) => ({
          schoolId: RequestContext.schoolId()!,
          invoiceId: inv.id,
          feeItemId: a.feeItemId,
          label: a.feeItem.name,
          category: a.feeItem.category,
          amountKobo: a.amountKobo,
          isOptional: false,
          addedById: RequestContext.get()?.userId ?? null,
        })),
      });
      await this.core.syncInvoices(tx, [inv.id]);
      const total = add.reduce((s, a) => s + a.amountKobo, 0n);
      return {
        change: 'added',
        amount: Number(total) / 100,
        note: `${naira(total)} boarding fees added to the ${term.name} invoice.`,
      };
    }
    const lines = inv.lines.filter((l) => l.feeItem && l.feeItem.appliesTo !== 'EVERYONE');
    if (!lines.length) return { change: 'none', amount: 0, note: null };
    const total = lines.reduce((s, l) => s + l.amountKobo, 0n);
    const today = lagosToday(this.clock.now());
    const cutOff = new Date(term.startsOn.getTime() + BOARDING_REFUND_DAYS * 86_400_000);
    if (today > cutOff)
      return {
        change: 'kept',
        amount: Number(total) / 100,
        note: `${naira(total)} boarding fees stay on the ${term.name} invoice (more than ${BOARDING_REFUND_DAYS} days into the term). Finance can adjust it.`,
      };
    await tx.invoiceLine.deleteMany({ where: { id: { in: lines.map((l) => l.id) } } });
    await this.core.syncInvoices(tx, [inv.id]);
    return {
      change: 'removed',
      amount: Number(total) / 100,
      note: `${naira(total)} boarding fees taken off the ${term.name} invoice.`,
    };
  }
}
