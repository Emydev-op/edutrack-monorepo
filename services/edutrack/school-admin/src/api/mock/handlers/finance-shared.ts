import { MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import type {
  ExpenseRow,
  InvoiceRow,
  PaymentRow,
  PayToDetails,
  RefundRow,
  TimelineEntry,
  VendorRow,
} from '@/types';

import {
  financeData,
  recordStudents,
  termsOf,
  type ExpenseRec,
  type FinanceData,
  type FinStudent,
  type InvoiceRec,
  type PaymentRec,
  type RefundRec,
  type TermRef,
  type VendorRec,
} from '../finance-db';
import { buildLedger, isoToday, last, sum, type Ledger } from '../finance-ledger';
import { schoolData } from '../school-db';
import { studentsData } from '../students-db';
import { acadFor, currentTerm, fmtDate, nowLabel } from './academics-shared';

export const naira = (n: number) =>
  `${n < 0 ? '−' : ''}₦${Math.abs(Math.round(n)).toLocaleString('en-NG')}`;
export const millions = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1000
      ? `₦${Math.round(n / 1000).toLocaleString('en-NG')}k`
      : naira(n);

/** The signed-in school's finance data with its ledger, terms, students and audit helpers. */
export function finFor(req: Pick<MockRequest, 'headers'>) {
  const ctx = acadFor(req);
  const fin = financeData[ctx.schoolId]!;
  const terms = termsOf(ctx.schoolId);
  const termStart = (id: string) => terms.find((t) => t.id === id)?.start ?? isoToday();
  const make = () => buildLedger(fin, termStart);
  const out = {
    ...ctx,
    fin,
    terms,
    termStart,
    ledger: make(),
    students: fin.studentIndex(),
    /** Recompute balances after a change in this request. */
    refresh() {
      out.ledger = make();
      out.students = fin.studentIndex();
      syncBalances(fin, out.ledger);
      return out;
    },
  };
  return out;
}
export type FinCtx = ReturnType<typeof finFor>;

/** Keeps each Students-section record's balance equal to what Finance says they owe. */
export function syncBalances(fin: FinanceData, ledger: Ledger) {
  const sd = studentsData[fin.schoolId];
  if (!sd) return;
  const owed = new Map<string, number>();
  for (const inv of fin.invoices) {
    const b = ledger.invoice(inv.id).balance;
    if (b) owed.set(inv.studentKey, (owed.get(inv.studentKey) ?? 0) + b);
  }
  for (const s of sd.students) s.balance = owed.get(s.id) ?? 0;
}

export function studentOf(ctx: FinCtx, key: string): FinStudent {
  const s = ctx.students.get(key);
  if (!s) throw new MockHttpError(404, 'Student not found');
  return s;
}

export const classOf = (s: { level: string; arm: string | null }) =>
  s.arm ? `${s.level}${/\d$/.test(s.level) ? '' : ' '}${s.arm}` : `${s.level} · not placed`;

export const branchNameOf = (ctx: FinCtx, id: string | null) =>
  id ? (ctx.data.branches.find((b) => b.id === id)?.name ?? 'Removed branch') : 'All branches';

/** Branch id for a `branch` query (id or name); null means all branches. */
export function branchScope(ctx: FinCtx, value?: string) {
  if (!value || value === 'All branches' || value === 'all') return null;
  return ctx.data.branches.find((b) => b.id === value || b.name === value)?.id ?? null;
}

/** The term a request names (id, or name within `session`), else the current term. */
export function termOf(ctx: FinCtx, value?: string, session?: string): TermRef {
  const cur = ctx.terms.find((t) => t.id === currentTerm(ctx.acad)?.id);
  const found =
    ctx.terms.find((t) => t.id === value) ??
    (session ? ctx.terms.find((t) => t.name === value && t.session === session) : undefined) ??
    ctx.terms.find((t) => t.name === value && t.session === cur?.session) ??
    cur ??
    ctx.terms[0];
  if (!found) throw new MockHttpError(409, 'Create an academic session and its terms first.');
  return found;
}

export const termLabel = (t: TermRef) => `${t.session} · ${t.name}`;

export function requireMoney(value: unknown, message: string, { allowZero = false } = {}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || (!allowZero && n === 0))
    throw new MockHttpError(422, message);
  if (n > 100_000_000) throw new MockHttpError(422, 'That amount is too large.');
  return n;
}

export function requireDate(value: unknown, message: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new MockHttpError(422, message);
  return value;
}

export const historyEntry = (
  title: string,
  detail: string,
  tone: TimelineEntry['tone'] = 'info',
): TimelineEntry => ({
  id: `h${Date.now()}${Math.random()}`,
  title,
  detail,
  when: nowLabel(),
  tone,
});

/** ISO dates in stored history become "8 Sep 2026"; newer entries already carry a label. */
export const showHistory = (entries: TimelineEntry[]) =>
  [...entries]
    .reverse()
    .map((e) => (/^\d{4}-\d{2}-\d{2}$/.test(e.when) ? { ...e, when: fmtDate(e.when) } : e));

/* ---------------- Row mappers ---------------- */

export function invoiceRow(ctx: FinCtx, inv: InvoiceRec): InvoiceRow {
  const s = ctx.students.get(inv.studentKey);
  const term = ctx.terms.find((t) => t.id === inv.termId);
  const st = ctx.ledger.invoice(inv.id);
  return {
    id: inv.id,
    no: inv.no || 'Draft',
    studentKey: inv.studentKey,
    studentId: s?.recordId ?? null,
    student: s?.name ?? 'Unknown student',
    admissionNo: s?.admissionNo ?? '',
    className: classOf(inv),
    branch: branchNameOf(ctx, inv.branchId),
    payer: s?.payer ?? null,
    payerPhone: s?.payerPhone ?? '',
    session: term?.session ?? '',
    term: term?.name ?? '',
    termId: inv.termId,
    total: st.total,
    paid: st.paid,
    pending: st.pending,
    balance: st.balance,
    status: st.status,
    overdue: st.overdue,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn,
    dueNote: st.dueNote,
  };
}

export function paymentRow(ctx: FinCtx, p: PaymentRec): PaymentRow {
  const s = ctx.students.get(p.studentKey);
  return {
    id: p.id,
    no: p.no,
    date: p.date,
    studentKey: p.studentKey,
    studentId: s?.recordId ?? null,
    student: s?.name ?? 'Unknown student',
    className: s ? classOf(s) : '',
    payer: p.payer,
    method: p.method,
    reference: p.reference,
    account: ctx.fin.accounts.find((a) => a.id === p.accountId)?.name ?? '—',
    amount: p.amount,
    status: p.status,
    source: p.source,
    invoices: p.allocations.map(
      (a) => ctx.fin.invoices.find((i) => i.id === a.invoiceId)?.no ?? '',
    ),
    unallocated: ctx.ledger.unallocated(p),
    refunded: ctx.ledger.refundedFrom(p.id),
    recordedBy: p.recordedBy,
  };
}

export function refundRow(ctx: FinCtx, r: RefundRec): RefundRow {
  const s = ctx.students.get(r.studentKey);
  return {
    id: r.id,
    no: r.no,
    studentKey: r.studentKey,
    student: s?.name ?? 'Unknown student',
    payer: s?.payer ?? '—',
    amount: r.amount,
    reason: r.reason,
    paymentNo: ctx.fin.payments.find((p) => p.id === r.paymentId)?.no ?? null,
    requestedBy: r.requestedBy,
    requestedOn: r.requestedOn,
    approvedBy: r.approvedBy,
    status: r.status,
    needs: r.amount > ctx.fin.settings.refundLimit ? 'Proprietor' : 'Principal',
  };
}

export function expenseRow(ctx: FinCtx, e: ExpenseRec): ExpenseRow {
  return {
    id: e.id,
    no: e.no || 'Draft',
    date: e.date,
    category: e.category,
    description: e.description,
    vendorId: e.vendorId,
    vendor: ctx.fin.vendors.find((v) => v.id === e.vendorId)?.name ?? null,
    branch: branchNameOf(ctx, e.branchId),
    amount: e.amount,
    status: e.status,
    waitingOn: e.status === 'Submitted' ? nextApprover(ctx.fin, e) : null,
    submittedBy: e.submittedBy,
  };
}

/** Bursar approves up to the limit; above it, the Principal approves after the Bursar. */
export const approvalSteps = (fin: FinanceData, e: { amount: number }) =>
  e.amount > fin.settings.expenseLimit ? ['Bursar', 'Principal'] : ['Bursar'];
export const nextApprover = (fin: FinanceData, e: ExpenseRec) =>
  approvalSteps(fin, e).find((role) => !e.approvals.some((a) => a.role === role)) ?? null;

export function vendorRow(ctx: FinCtx, v: VendorRec): VendorRow {
  const mine = ctx.fin.expenses.filter((e) => e.vendorId === v.id);
  const session = sessionRange(ctx);
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    contactName: v.contactName,
    phone: v.phone,
    email: v.email,
    bank: v.bank,
    accountNumber: v.accountNumber,
    accountName: v.accountName,
    paid: sum(
      mine
        .filter((e) => e.status === 'Paid' && e.paidOn && e.paidOn >= session.start)
        .map((e) => e.amount),
    ),
    outstanding: sum(
      mine.filter((e) => e.status === 'Approved' || e.status === 'Submitted').map((e) => e.amount),
    ),
    expenses: mine.length,
    lastExpense: last(mine.map((e) => e.date).sort()) ?? null,
    status: v.status,
  };
}

/** The current session's date range (finance year), falling back to the calendar year. */
export function sessionRange(ctx: FinCtx) {
  const s = ctx.acad.sessions.find((x) => x.status === 'Active') ?? ctx.acad.sessions[0];
  return s
    ? { start: addMonthsBack(s.start), end: s.end, name: s.name }
    : { start: '2000-01-01', end: '2999-12-31', name: '' };
}
/** Spending for a session starts with the August prep before resumption. */
const addMonthsBack = (iso: string) =>
  `${iso.slice(0, 5)}08-01` < iso ? `${iso.slice(0, 5)}08-01` : iso;

/** Where parents pay a student's fees: the branch's parent-facing account, else the school's. */
export function payTo(ctx: FinCtx, s: FinStudent, amount: number): PayToDetails | null {
  const acc =
    ctx.fin.accounts.find(
      (a) => a.status === 'Active' && a.showToParents && a.branchId === s.branchId,
    ) ??
    ctx.fin.accounts.find((a) => a.status === 'Active' && a.showToParents && !a.branchId) ??
    ctx.fin.accounts.find((a) => a.status === 'Active' && a.showToParents);
  if (!acc) return null;
  const reference =
    ctx.fin.settings.transferReference === 'Invoice number'
      ? (ctx.fin.invoices.find((i) => i.studentKey === s.key && i.status === 'Issued')?.no ??
        s.admissionNo)
      : s.admissionNo;
  return {
    bank: acc.bank,
    accountNumber: acc.accountNumber,
    accountName: acc.accountName,
    reference,
    message: `Dear ${s.payer ?? 'Parent'}, ${s.name}'s outstanding school fees are ${naira(amount)}. Please pay by bank transfer to ${acc.bank} ${acc.accountNumber} (${acc.accountName}) and use ${reference} as the narration. After paying, tap "I've made a payment" in the Parent Portal so the school can confirm it.`,
  };
}

/** Open invoices for a student, oldest balance first (previous sessions before this one). */
export function openInvoices(ctx: FinCtx, key: string) {
  return ctx.fin.invoices
    .filter(
      (i) => i.studentKey === key && i.status === 'Issued' && ctx.ledger.invoice(i.id).balance > 0,
    )
    .sort((a, b) => {
      const ta = ctx.terms.findIndex((t) => t.id === a.termId);
      const tb = ctx.terms.findIndex((t) => t.id === b.termId);
      // terms are newest session first, so a higher index is older.
      return tb - ta || (a.issuedOn ?? '').localeCompare(b.issuedOn ?? '');
    });
}

export const outstandingOf = (ctx: FinCtx, key: string) =>
  sum(
    ctx.fin.invoices
      .filter((i) => i.studentKey === key)
      .map((i) => ctx.ledger.invoice(i.id).balance),
  );

/** All finance students, enrolled ones first. */
export const allStudents = (ctx: FinCtx) => [...ctx.students.values()];

export { isoToday, recordStudents };

/** Finance for a school outside a request (dashboard, students, setup, search). */
export function financeSnapshot(schoolId: string) {
  const fin = financeData[schoolId]!;
  const terms = termsOf(schoolId);
  const ledger = buildLedger(fin, (id) => terms.find((t) => t.id === id)?.start ?? isoToday());
  return { fin, terms, ledger, students: fin.studentIndex() };
}

// Student balances in the Students section start out equal to the ledger.
for (const id of Object.keys(financeData)) {
  const s = financeSnapshot(id);
  syncBalances(s.fin, s.ledger);
}

/** invoiceRow for a snapshot taken outside a request. */
export function invoiceRowFor(snap: ReturnType<typeof financeSnapshot>, inv: InvoiceRec) {
  return invoiceRow({ ...snap, data: schoolData[snap.fin.schoolId]! } as unknown as FinCtx, inv);
}
