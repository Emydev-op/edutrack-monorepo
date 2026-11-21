import { RequestContext } from '../../common/context/request-context.js';
import type {
  ExpenseRec,
  FinanceData,
  FinStudent,
  InvoiceRec,
  PaymentRec,
  RefundRec,
  TermRef,
  VendorRec,
} from './finance-data.js';
import { classOf, finConflict, last, money, notFound, sum } from './finance-format.js';
import { buildLedger, type InvoiceStatusLabel, type Ledger } from './finance-ledger.js';

/* ---------------- Shapes the screens read (`school-admin/src/types/finance.ts`) ---------------- */

export interface InvoiceRow {
  id: string;
  no: string;
  studentKey: string;
  studentId: string | null;
  student: string;
  admissionNo: string;
  className: string;
  branch: string;
  payer: string | null;
  payerPhone: string;
  session: string;
  term: string;
  termId: string;
  total: number;
  paid: number;
  pending: number;
  balance: number;
  status: InvoiceStatusLabel;
  overdue: boolean;
  issuedOn: string | null;
  dueOn: string;
  dueNote: string;
}

export interface PaymentRow {
  id: string;
  no: string;
  date: string;
  studentKey: string;
  studentId: string | null;
  student: string;
  className: string;
  payer: string;
  method: string;
  reference: string;
  account: string;
  amount: number;
  status: string;
  source: string;
  invoices: string[];
  unallocated: number;
  refunded: number;
  recordedBy: string;
}

export interface RefundRow {
  id: string;
  no: string;
  studentKey: string;
  student: string;
  payer: string;
  amount: number;
  reason: string;
  paymentNo: string | null;
  requestedBy: string;
  requestedOn: string;
  approvedBy: string | null;
  status: string;
  needs: 'Principal' | 'Proprietor';
}

export interface ExpenseRow {
  id: string;
  no: string;
  date: string;
  category: string;
  description: string;
  vendorId: string | null;
  vendor: string | null;
  branch: string;
  amount: number;
  status: string;
  waitingOn: string | null;
  submittedBy: string;
}

export interface VendorRow {
  id: string;
  name: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  paid: number;
  outstanding: number;
  expenses: number;
  lastExpense: string | null;
  status: 'Active' | 'Inactive';
}

export interface PayToDetails {
  bank: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  message: string;
}

export interface FinanceNotice {
  tone: 'success' | 'info' | 'warning' | 'error' | 'neutral';
  title: string;
  description: string;
  action?: {
    label: string;
    to: { name: string; query?: Record<string, string>; params?: Record<string, string> };
  };
}

export interface TimelineEntry {
  id: string;
  title: string;
  detail?: string;
  when: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

/**
 * A request's view of the school's finance: the snapshot, its ledger and the helpers every
 * screen shares (as the mock's `finance-shared.ts`). Built per request by `FinanceCore.load()`.
 */
export class FinView {
  readonly ledger: Ledger;

  constructor(
    readonly fin: FinanceData,
    /** Display name of the signed-in person ("Kunle Bakare"). */
    readonly actor: string,
  ) {
    this.ledger = buildLedger(fin);
  }

  get today() {
    return this.fin.today;
  }
  get students() {
    return this.fin.students;
  }
  get terms() {
    return this.fin.terms;
  }

  /* ---------------- Look-ups ---------------- */

  studentOf(key: string): FinStudent {
    const s = this.fin.students.get(key);
    if (!s) throw notFound('Student not found', 'STUDENT_NOT_FOUND');
    return s;
  }

  branchName(id: string | null) {
    return id
      ? (this.fin.branches.find((b) => b.id === id)?.name ?? 'Removed branch')
      : 'All branches';
  }

  activeBranches() {
    return this.fin.branches.filter((b) => b.active);
  }

  /** Branch id for a `branch` query (id or name); null means all branches. */
  branchScope(value?: string | null) {
    if (!value || value === 'All branches' || value === 'all') return null;
    return this.fin.branches.find((b) => b.id === value || b.name === value)?.id ?? null;
  }

  /**
   * The term screens work in: School Admin's working session and term on a read (a past session's
   * figures), else the active term. Writes always get the active term.
   */
  currentTerm(): TermRef | null {
    const live = this.terms.find((t) => t.id === this.fin.currentTermId) ?? null;
    const w = RequestContext.working();
    if (!w.session && !w.term) return live;
    const session = w.session ?? live?.session;
    return (
      this.terms.find((t) => t.session === session && t.name === (w.term ?? live?.name)) ??
      this.terms.find((t) => t.session === session) ??
      live
    );
  }

  /** The term a request names (id, or name within `session`), else the current term. */
  termOf(value?: string | null, session?: string | null): TermRef {
    const cur = this.currentTerm();
    const found =
      this.terms.find((t) => t.id === value) ??
      (session ? this.terms.find((t) => t.name === value && t.session === session) : undefined) ??
      this.terms.find((t) => t.name === value && t.session === cur?.session) ??
      cur ??
      this.terms[0];
    if (!found) throw finConflict('Create an academic session and its terms first.', 'NO_SESSION');
    return found;
  }

  termLabel(t: TermRef) {
    return `${t.session} · ${t.name}`;
  }

  /** Terms Finance plans for: every term of the active and upcoming sessions. */
  planningTerms() {
    return this.terms.filter((t) => t.sessionStatus === 'Active' || t.sessionStatus === 'Upcoming');
  }

  levelRank(name: string) {
    return this.fin.levels.find((l) => l.name === name)?.rank ?? 0;
  }

  /** Class levels a branch runs, in section order. */
  branchLevels(branchId: string) {
    return (this.fin.branchLevels.get(branchId) ?? [])
      .map((id) => this.fin.levels.find((l) => l.id === id)!)
      .filter(Boolean)
      .map((l) => ({ id: l.id, name: l.name, section: l.section }));
  }

  /** Where the student was in a term's session (level, arm, branch), else where they are now. */
  placement(s: FinStudent, term: TermRef) {
    const e = s.enrollments.get(term.sessionId);
    if (!e) return null;
    const level = this.fin.levels.find((l) => l.id === e.levelId);
    return {
      levelId: e.levelId,
      level: level?.name ?? '',
      armId: e.armId,
      branchId: e.branchId,
      active: e.active,
    };
  }

  /** The current session's date range (finance year), from August before resumption. */
  sessionRange() {
    const cur = this.currentTerm();
    const terms = cur ? this.terms.filter((t) => t.sessionId === cur.sessionId) : [];
    if (!terms.length) return { start: '2000-01-01', end: '2999-12-31', name: '' };
    const start = terms.map((t) => t.start).sort()[0]!;
    const end = terms
      .map((t) => t.end)
      .sort()
      .reverse()[0]!;
    const aug = `${start.slice(0, 5)}08-01`;
    return { start: aug < start ? aug : start, end, name: cur!.session };
  }

  /* ---------------- Balances ---------------- */

  /** Open invoices for a student, oldest first (earlier sessions before this one). */
  openInvoices(key: string) {
    const order = (termId: string) => this.terms.find((t) => t.id === termId)?.start ?? '';
    return this.fin.invoices
      .filter(
        (i) =>
          i.studentKey === key && i.status === 'Issued' && this.ledger.invoice(i.id).balance > 0,
      )
      .sort(
        (a, b) =>
          order(a.termId).localeCompare(order(b.termId)) ||
          (a.issuedOn ?? '').localeCompare(b.issuedOn ?? ''),
      );
  }

  outstandingOf(key: string) {
    return sum(
      this.fin.invoices
        .filter((i) => i.studentKey === key)
        .map((i) => this.ledger.invoice(i.id).balance),
    );
  }

  /** Where parents pay a student's fees: the branch's parent-facing account, else the school's. */
  payTo(s: FinStudent, amount: number): PayToDetails | null {
    const accs = this.fin.accounts.filter((a) => a.status === 'Active' && a.showToParents);
    const acc =
      accs.find((a) => a.branchId === s.branchId) ?? accs.find((a) => !a.branchId) ?? accs[0];
    if (!acc) return null;
    const reference =
      this.fin.settings.transferReference === 'Invoice number'
        ? (this.openInvoices(s.key)[0]?.no ?? s.admissionNo)
        : s.admissionNo;
    return {
      bank: acc.bank,
      accountNumber: acc.accountNumber,
      accountName: acc.accountName,
      reference,
      message: `Dear ${s.payer ?? 'Parent'}, ${s.name}'s outstanding school fees are ${money(amount)}. Please pay by bank transfer to ${acc.bank} ${acc.accountNumber} (${acc.accountName}) and use ${reference} as the narration. After paying, tap "I've made a payment" in the Parent Portal so the school can confirm it.`,
    };
  }

  /* ---------------- Row mappers ---------------- */

  invoiceRow(inv: InvoiceRec): InvoiceRow {
    const s = this.fin.students.get(inv.studentKey);
    const term = this.terms.find((t) => t.id === inv.termId);
    const st = this.ledger.invoice(inv.id);
    return {
      id: inv.id,
      no: inv.no || 'Draft',
      studentKey: inv.studentKey,
      studentId: s?.recordId ?? null,
      student: s?.name ?? 'Unknown student',
      admissionNo: s?.admissionNo ?? '',
      className: classOf(inv),
      branch: this.branchName(inv.branchId),
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

  paymentRow(p: PaymentRec): PaymentRow {
    const s = this.fin.students.get(p.studentKey);
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
      account: this.fin.accounts.find((a) => a.id === p.accountId)?.name ?? '—',
      amount: p.amount,
      status: p.status,
      source: p.source,
      invoices: p.allocations.map(
        (a) => this.fin.invoices.find((i) => i.id === a.invoiceId)?.no ?? '',
      ),
      unallocated: this.ledger.unallocated(p),
      refunded: this.ledger.refundedFrom(p.id),
      recordedBy: p.recordedBy,
    };
  }

  refundRow(r: RefundRec): RefundRow {
    const s = this.fin.students.get(r.studentKey);
    return {
      id: r.id,
      no: r.no,
      studentKey: r.studentKey,
      student: s?.name ?? 'Unknown student',
      payer: s?.payer ?? '—',
      amount: r.amount,
      reason: r.reason,
      paymentNo: this.fin.payments.find((p) => p.id === r.paymentId)?.no ?? null,
      requestedBy: r.requestedBy,
      requestedOn: r.requestedOn,
      approvedBy: r.approvedBy,
      status: r.status,
      needs: r.amount > this.fin.settings.refundLimit ? 'Proprietor' : 'Principal',
    };
  }

  /** Bursar approves up to the limit; above it, the Principal approves after the Bursar. */
  approvalSteps(e: { amount: number }): ('Bursar' | 'Principal')[] {
    return e.amount > this.fin.settings.expenseLimit ? ['Bursar', 'Principal'] : ['Bursar'];
  }
  nextApprover(e: ExpenseRec) {
    return this.approvalSteps(e).find((role) => !e.approvals.some((a) => a.role === role)) ?? null;
  }

  expenseRow(e: ExpenseRec): ExpenseRow {
    return {
      id: e.id,
      no: e.no || 'Draft',
      date: e.date,
      category: e.category,
      description: e.description,
      vendorId: e.vendorId,
      vendor: this.fin.vendors.find((v) => v.id === e.vendorId)?.name ?? null,
      branch: this.branchName(e.branchId),
      amount: e.amount,
      status: e.status,
      waitingOn: e.status === 'Submitted' ? this.nextApprover(e) : null,
      submittedBy: e.submittedBy,
    };
  }

  vendorRow(v: VendorRec): VendorRow {
    const mine = this.fin.expenses.filter((e) => e.vendorId === v.id);
    const session = this.sessionRange();
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
        mine
          .filter((e) => e.status === 'Approved' || e.status === 'Submitted')
          .map((e) => e.amount),
      ),
      expenses: mine.length,
      lastExpense: last(mine.map((e) => e.date).sort()) ?? null,
      status: v.status,
    };
  }
}
