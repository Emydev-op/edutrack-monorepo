import type {
  AccountRec,
  FinanceData,
  FinStudent,
  InvoiceRec,
  PaymentRec,
  PlanRec,
} from './finance-data.js';
import { addDays, daysBetween, shortDate, sum } from './finance-format.js';

/*
 * The finance ledger: every figure Finance shows is computed here from invoices, payments,
 * credit, refunds, expenses and transfers (as the School Admin mock's `finance-ledger.ts`).
 *
 * - Only Confirmed payments reduce balances. Pending verification shows as pending; Rejected
 *   counts for nothing.
 * - A payment is allocated to invoices; anything left over is credit on the student's account.
 * - An invoice is paid by allocations and applied credit, capped at its total. If its total drops
 *   below what was paid (a line removed, a discount added) or it is cancelled, the excess becomes
 *   credit. Credit can be applied to another invoice or refunded.
 * - Refunds come out of credit and are paid from a school account once approved.
 */

export type InvoiceStatusLabel =
  'Draft' | 'Issued' | 'Partially paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface Installment {
  index: number;
  label: string;
  amount: number;
  due: string;
  paid: number;
  status: 'Paid' | 'Part paid' | 'Overdue' | 'Due soon' | 'Upcoming';
}

export interface InvoiceState {
  subtotal: number;
  discount: number;
  total: number;
  /** Confirmed allocations plus applied credit, capped at the total. */
  paid: number;
  /** Raw confirmed money against it (may exceed total). */
  received: number;
  pending: number;
  balance: number;
  status: InvoiceStatusLabel;
  overdue: boolean;
  installments: Installment[];
  dueNote: string;
}

type Amounts = { amount: number }[];
export const subtotalOf = (inv: { lines: Amounts }) => sum(inv.lines.map((l) => l.amount));
export const discountOf = (inv: { discounts: Amounts }) => sum(inv.discounts.map((d) => d.amount));
export const totalOf = (inv: { lines: Amounts; discounts: Amounts }) =>
  Math.max(0, subtotalOf(inv) - discountOf(inv));

/** Installment schedule: the plan split from the term start, filled by money paid in order. */
export function installmentsFor(
  inv: Pick<InvoiceRec, 'dueOn'>,
  plan: PlanRec | undefined,
  termStart: string,
  total: number,
  paid: number,
  today: string,
): Installment[] {
  const parts = plan && plan.split.length > 1 ? plan : null;
  const rows = parts
    ? parts.split.map((pct, i) => ({
        amount: i === parts.split.length - 1 ? 0 : Math.round((total * pct) / 100 / 500) * 500,
        due: addDays(termStart, parts.offsets[i] ?? 0),
      }))
    : [{ amount: total, due: inv.dueOn }];
  if (parts) rows[rows.length - 1]!.amount = total - sum(rows.slice(0, -1).map((r) => r.amount));
  let left = paid;
  return rows.map((r, i) => {
    const got = Math.min(left, r.amount);
    left -= got;
    const status: Installment['status'] =
      got >= r.amount
        ? 'Paid'
        : r.due < today
          ? 'Overdue'
          : got > 0
            ? 'Part paid'
            : daysBetween(today, r.due) <= 14
              ? 'Due soon'
              : 'Upcoming';
    return {
      index: i + 1,
      label: rows.length > 1 ? `Installment ${i + 1}` : 'Full payment',
      amount: r.amount,
      due: r.due,
      paid: got,
      status,
    };
  });
}

export interface Ledger {
  invoice: (id: string) => InvoiceState;
  /** Credit on account per student: unallocated + over-allocated − refunds. */
  credit: (studentKey: string) => number;
  /** How much of a payment is credit (not on any invoice). */
  unallocated: (p: PaymentRec) => number;
  refundedFrom: (paymentId: string) => number;
  accountBalance: (accountId: string, upTo?: string) => number;
  accountPending: (accountId: string) => number;
}

export function buildLedger(fin: FinanceData): Ledger {
  const confirmedAlloc = new Map<string, number>();
  const pendingAlloc = new Map<string, number>();
  const creditUsed = new Map<string, number>();
  for (const p of fin.payments) {
    if (p.status === 'Rejected') continue;
    const target = p.status === 'Confirmed' ? confirmedAlloc : pendingAlloc;
    for (const a of p.allocations)
      target.set(a.invoiceId, (target.get(a.invoiceId) ?? 0) + a.amount);
  }
  for (const c of fin.creditUses)
    creditUsed.set(c.invoiceId, (creditUsed.get(c.invoiceId) ?? 0) + c.amount);
  const invoices = new Map(fin.invoices.map((i) => [i.id, i]));
  const termStart = (id: string) => fin.terms.find((t) => t.id === id)?.start ?? fin.today;

  const cache = new Map<string, InvoiceState>();
  const invoice = (id: string): InvoiceState => {
    const hit = cache.get(id);
    if (hit) return hit;
    const inv = invoices.get(id)!;
    const subtotal = subtotalOf(inv);
    const discount = discountOf(inv);
    const total = Math.max(0, subtotal - discount);
    const received = (confirmedAlloc.get(id) ?? 0) + (creditUsed.get(id) ?? 0);
    const cancelled = inv.status === 'Cancelled';
    const paid = cancelled ? 0 : Math.min(total, received);
    const balance = cancelled || inv.status === 'Draft' ? 0 : total - paid;
    const pending = cancelled ? 0 : Math.min(pendingAlloc.get(id) ?? 0, balance);
    const plan = fin.plans.find((p) => p.id === inv.planId);
    const installments =
      cancelled || inv.status === 'Draft'
        ? []
        : installmentsFor(inv, plan, termStart(inv.termId), total, paid, fin.today);
    const overdueRow = installments.find((r) => r.status === 'Overdue');
    const overdue = balance > 0 && !!overdueRow;
    const status: InvoiceStatusLabel = cancelled
      ? 'Cancelled'
      : inv.status === 'Draft'
        ? 'Draft'
        : balance <= 0
          ? 'Paid'
          : overdue
            ? 'Overdue'
            : paid > 0
              ? 'Partially paid'
              : 'Issued';
    const next = installments.find((r) => r.status !== 'Paid');
    const dueNote =
      status === 'Paid' || status === 'Cancelled' || status === 'Draft' || !next
        ? ''
        : installments.length > 1
          ? `${overdueRow ? `${overdueRow.label} overdue` : `${next.label} due`} · ${shortDate(overdueRow?.due ?? next.due)}`
          : `${overdue ? 'Overdue since' : 'Due'} ${shortDate(inv.dueOn)}`;
    const state: InvoiceState = {
      subtotal,
      discount,
      total,
      paid,
      received,
      pending,
      balance,
      status,
      overdue,
      installments,
      dueNote,
    };
    cache.set(id, state);
    return state;
  };

  const unallocated = (p: PaymentRec) =>
    Math.max(0, p.amount - sum(p.allocations.map((a) => a.amount)));
  const refundedFrom = (paymentId: string) =>
    sum(
      fin.refunds
        .filter((r) => r.paymentId === paymentId && r.status !== 'Rejected')
        .map((r) => r.amount),
    );

  const creditCache = new Map<string, number>();
  const credit = (key: string) => {
    const hit = creditCache.get(key);
    if (hit !== undefined) return hit;
    const fromPayments = sum(
      fin.payments.filter((p) => p.studentKey === key && p.status === 'Confirmed').map(unallocated),
    );
    const overAllocated = sum(
      fin.invoices
        .filter((i) => i.studentKey === key)
        .map((i) => {
          const s = invoice(i.id);
          return i.status === 'Cancelled' ? s.received : Math.max(0, s.received - s.total);
        }),
    );
    const usedCredit = sum(fin.creditUses.filter((c) => c.studentKey === key).map((c) => c.amount));
    const refunds = sum(
      fin.refunds
        .filter((r) => r.studentKey === key && r.status !== 'Rejected')
        .map((r) => r.amount),
    );
    const value = Math.max(0, fromPayments + overAllocated - usedCredit - refunds);
    creditCache.set(key, value);
    return value;
  };

  const accountBalance = (accountId: string, upTo = '9999-12-31') => {
    const acc = fin.accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    return accountMovements(fin, acc)
      .filter((m) => m.date <= upTo)
      .reduce((b, m) => b + m.moneyIn - m.moneyOut, 0);
  };
  const accountPending = (accountId: string) =>
    sum(
      fin.payments
        .filter((p) => p.accountId === accountId && p.status === 'Pending verification')
        .map((p) => p.amount),
    );

  return { invoice, credit, unallocated, refundedFrom, accountBalance, accountPending };
}

export interface Movement {
  id: string;
  date: string;
  kind: 'Payment' | 'Expense' | 'Refund' | 'Transfer in' | 'Transfer out' | 'Opening balance';
  ref: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  link: { type: 'payment' | 'expense' | 'refund' | 'transfer'; id: string } | null;
}

/** Everything that moved money in or out of an account, oldest first. */
export function accountMovements(fin: FinanceData, acc: AccountRec): Movement[] {
  const name = (key: string) => fin.students.get(key)?.name ?? 'Unknown student';
  const out: Movement[] = [
    {
      id: `open-${acc.id}`,
      date: acc.openingDate,
      kind: 'Opening balance',
      ref: '—',
      description: 'Opening balance',
      moneyIn: acc.openingBalance,
      moneyOut: 0,
      link: null,
    },
  ];
  for (const p of fin.payments)
    if (p.accountId === acc.id && p.status === 'Confirmed')
      out.push({
        id: p.id,
        date: p.date,
        kind: 'Payment',
        ref: p.no,
        description: `${p.method} · ${name(p.studentKey)}${p.reference ? ` · ${p.reference}` : ''}`,
        moneyIn: p.amount,
        moneyOut: 0,
        link: { type: 'payment', id: p.id },
      });
  for (const e of fin.expenses)
    if (e.accountId === acc.id && e.status === 'Paid' && e.paidOn)
      out.push({
        id: e.id,
        date: e.paidOn,
        kind: 'Expense',
        ref: e.no,
        description: `${e.description}${e.vendorId ? ` · ${fin.vendors.find((v) => v.id === e.vendorId)?.name ?? ''}` : ''}`,
        moneyIn: 0,
        moneyOut: e.amount,
        link: { type: 'expense', id: e.id },
      });
  for (const r of fin.refunds)
    if (r.paidFrom === acc.id && r.status === 'Paid' && r.paidOn)
      out.push({
        id: r.id,
        date: r.paidOn,
        kind: 'Refund',
        ref: r.no,
        description: `Refund to ${r.payTo}`,
        moneyIn: 0,
        moneyOut: r.amount,
        link: { type: 'refund', id: r.id },
      });
  for (const t of fin.transfers) {
    if (t.toId === acc.id)
      out.push({
        id: `${t.id}-in`,
        date: t.date,
        kind: 'Transfer in',
        ref: t.reference || t.no,
        description: `From ${fin.accounts.find((a) => a.id === t.fromId)?.name ?? 'account'}${t.note ? ` · ${t.note}` : ''}`,
        moneyIn: t.amount,
        moneyOut: 0,
        link: { type: 'transfer', id: t.id },
      });
    if (t.fromId === acc.id)
      out.push({
        id: `${t.id}-out`,
        date: t.date,
        kind: 'Transfer out',
        ref: t.reference || t.no,
        description: `To ${fin.accounts.find((a) => a.id === t.toId)?.name ?? 'account'}${t.note ? ` · ${t.note}` : ''}`,
        moneyIn: 0,
        moneyOut: t.amount,
        link: { type: 'transfer', id: t.id },
      });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Money paid against open invoices, oldest balance first, for a payment of `amount`. */
export function allocateOldestFirst(
  open: { id: string; balance: number }[],
  amount: number,
): { invoiceId: string; amount: number }[] {
  let left = amount;
  const out: { invoiceId: string; amount: number }[] = [];
  for (const inv of open) {
    if (left <= 0) break;
    const take = Math.min(left, inv.balance);
    if (take > 0) out.push({ invoiceId: inv.id, amount: take });
    left -= take;
  }
  return out;
}

/**
 * Sibling position per student among those sharing a fee payer: eldest (highest class, then
 * earliest admission) is 1st. Students without a fee payer are never siblings.
 */
export function siblingPositions(students: FinStudent[], rank: (s: FinStudent) => number) {
  const byPayer = new Map<string, FinStudent[]>();
  for (const s of students) {
    if (!s.payerGuardianId) continue;
    byPayer.set(s.payerGuardianId, [...(byPayer.get(s.payerGuardianId) ?? []), s]);
  }
  const pos = new Map<string, { position: number; eldest: string }>();
  for (const kids of byPayer.values()) {
    const sorted = [...kids].sort(
      (a, b) => rank(b) - rank(a) || a.admissionNo.localeCompare(b.admissionNo),
    );
    sorted.forEach((s, i) => pos.set(s.key, { position: i + 1, eldest: sorted[0]!.name }));
  }
  return pos;
}
