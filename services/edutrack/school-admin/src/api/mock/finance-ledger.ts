/*
 * The finance ledger: every figure Finance shows is computed here from invoices, payments,
 * credit, refunds, expenses and transfers, so the screens, the dashboard, student profiles and
 * the Setup Center always agree.
 *
 * Rules:
 * - Only Confirmed payments reduce balances. Pending verification shows as pending; Rejected counts
 *   for nothing.
 * - A payment is allocated to invoices; anything left over is credit on the student's account.
 * - An invoice is paid by allocations and applied credit, capped at its total. If its total drops
 *   below what was paid (a line removed, a discount added) or it is cancelled, the excess becomes
 *   credit. Credit can be applied to another invoice or refunded.
 * - Refunds come out of credit and are paid from a school account once approved.
 */
import type { InvoiceStatus, Installment } from '@/types';

import type {
  AccountRec,
  FinanceData,
  FinStudent,
  InvoiceRec,
  PaymentRec,
  PlanRec,
} from './finance-db';

export const DAY = 86_400_000;
/** Today in the school's local time (not UTC), so evening entries aren't "in the future". */
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];
export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export const subtotalOf = (inv: InvoiceRec) => sum(inv.lines.map((l) => l.amount));
export const discountOf = (inv: InvoiceRec) => sum(inv.discounts.map((d) => d.amount));
export const totalOf = (inv: InvoiceRec) => Math.max(0, subtotalOf(inv) - discountOf(inv));

export interface InvoiceState {
  total: number;
  /** Confirmed allocations plus applied credit, capped at the total. */
  paid: number;
  /** Raw confirmed money against it (may exceed total). */
  received: number;
  pending: number;
  balance: number;
  status: InvoiceStatus;
  overdue: boolean;
  installments: Installment[];
  dueNote: string;
}

export interface Ledger {
  invoice: (id: string) => InvoiceState;
  /** Credit on account per student: unallocated + over-allocated − applied − refunds. */
  credit: (studentKey: string) => number;
  /** How much of a payment is credit (not on any invoice). */
  unallocated: (p: PaymentRec) => number;
  refundedFrom: (paymentId: string) => number;
  accountBalance: (accountId: string, upTo?: string) => number;
  accountPending: (accountId: string) => number;
}

const cmpDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** Installment schedule for an invoice: plan split by term start, filled by money paid in order. */
export function installmentsFor(
  inv: InvoiceRec,
  plan: PlanRec | undefined,
  termStart: string,
  total: number,
  paid: number,
  today = isoToday(),
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

export function buildLedger(fin: FinanceData, termStart: (termId: string) => string): Ledger {
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

  const today = isoToday();
  const cache = new Map<string, InvoiceState>();
  const invoice = (id: string): InvoiceState => {
    const hit = cache.get(id);
    if (hit) return hit;
    const inv = fin.invoices.find((i) => i.id === id)!;
    const total = totalOf(inv);
    const received = (confirmedAlloc.get(id) ?? 0) + (creditUsed.get(id) ?? 0);
    const cancelled = inv.status === 'Cancelled';
    const paid = cancelled ? 0 : Math.min(total, received);
    const balance = cancelled || inv.status === 'Draft' ? 0 : total - paid;
    const pending = cancelled ? 0 : Math.min(pendingAlloc.get(id) ?? 0, balance);
    const plan = fin.plans.find((p) => p.id === inv.planId);
    const installments =
      cancelled || inv.status === 'Draft'
        ? []
        : installmentsFor(inv, plan, termStart(inv.termId), total, paid, today);
    const overdueRow = installments.find((r) => r.status === 'Overdue');
    const overdue = balance > 0 && !!overdueRow;
    const status: InvoiceStatus = cancelled
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
    const state = {
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
    const refunds = sum(
      fin.refunds
        .filter((r) => r.studentKey === key && r.status !== 'Rejected')
        .map((r) => r.amount),
    );
    const value = Math.max(0, fromPayments + overAllocated - refunds);
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
        description: `${p.method} · ${studentName(fin, p.studentKey)}${p.reference ? ` · ${p.reference}` : ''}`,
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
  return out.sort(cmpDate);
}

export function studentName(fin: FinanceData, key: string) {
  return fin.studentIndex().get(key)?.name ?? 'Unknown student';
}

export function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/** Money paid and still due on an invoice, oldest balance first, for a payment of `amount`. */
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

/** Level order for sibling ranking: higher class = elder child. */
export const LEVEL_ORDER = [
  'Pre-Nursery',
  'Nursery 1',
  'Nursery 2',
  'Primary 1',
  'Primary 2',
  'Primary 3',
  'Primary 4',
  'Primary 5',
  'Primary 6',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SSS 1',
  'SSS 2',
  'SSS 3',
];
export const levelRank = (level: string) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i < 0 ? 0 : i;
};

/**
 * Sibling position per student among those sharing a fee payer: eldest (highest class, then
 * earliest admission) is 1st. Students without a payer are never siblings.
 */
export function siblingPositions(students: FinStudent[]) {
  const byPayer = new Map<string, FinStudent[]>();
  for (const s of students) {
    if (!s.payer) continue;
    const k = `${s.payer}|${s.payerPhone}`;
    byPayer.set(k, [...(byPayer.get(k) ?? []), s]);
  }
  const pos = new Map<string, { position: number; eldest: string }>();
  for (const kids of byPayer.values()) {
    const sorted = [...kids].sort(
      (a, b) =>
        levelRank(b.level) - levelRank(a.level) || a.admissionNo.localeCompare(b.admissionNo),
    );
    sorted.forEach((s, i) => pos.set(s.key, { position: i + 1, eldest: sorted[0]!.name }));
  }
  return pos;
}
