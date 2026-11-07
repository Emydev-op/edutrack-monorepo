import type { Paginated } from '@edutrack/shared';
import type { RouteLocationRaw } from 'vue-router';

import type { TimelineEntry } from './common';

/*
 * Finance: fees → invoices → payments, with credit, refunds, bank & cash accounts, statement
 * matching, expenses and vendors. Money is whole naira. EduTrack never collects money itself:
 * payments are recorded by the school, or claimed by a parent ("I've made a payment") and then
 * verified against the bank statement.
 */

export type Tone = 'success' | 'info' | 'warning' | 'error' | 'neutral' | 'brand';

export interface FinanceNotice {
  tone: Exclude<Tone, 'brand'>;
  title: string;
  description: string;
  action?: { label: string; to: RouteLocationRaw };
}

export interface FinanceKpi {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}

export interface FinanceQuery {
  branch?: string;
  term?: string;
}

/* ---------------- Fees ---------------- */

export type FeeCategory =
  | 'Tuition'
  | 'Levy'
  | 'Exams'
  | 'ICT'
  | 'Books'
  | 'Uniform'
  | 'Transport'
  | 'Feeding'
  | 'Boarding'
  | 'Activities'
  | 'Admission'
  | 'Other';
export type FeeCharged = 'Every term' | 'Once a session' | 'New students only';
export type FeeType = 'Compulsory' | 'Optional';

export interface FeeItem {
  id: string;
  name: string;
  category: FeeCategory;
  charged: FeeCharged;
  type: FeeType;
  status: 'Active' | 'Archived';
  description: string;
  /** Invoice lines that carry this item. */
  invoiceLines: number;
}

export interface FeeItemPayload {
  name: string;
  category: FeeCategory;
  charged: FeeCharged;
  type: FeeType;
  description: string;
}

export type StructureStatus = 'Not created' | 'Draft' | 'Published';

export interface StructureLevel {
  id: string;
  name: string;
  section: string;
  students: number;
  /** itemId → naira, or null when not offered / blank. */
  amounts: Record<string, number | null>;
  compulsoryTotal: number;
  optionalTotal: number;
  /** Compulsory items left blank. */
  missing: string[];
}

export interface FeeStructureView {
  term: { id: string; name: string; session: string; start: string; end: string };
  branch: { id: string; name: string };
  status: StructureStatus;
  publishedOn: string | null;
  items: (FeeItem & { chargedThisTerm: boolean })[];
  sections: { name: string; levels: StructureLevel[] }[];
  students: number;
  /** Compulsory fees for every student, before discounts. */
  projected: number;
  invoicesIssued: number;
  terms: { id: string; name: string; session: string; status: string }[];
  branches: { id: string; name: string }[];
  /** Per term at this branch, for the term picker. */
  statuses: Record<string, StructureStatus>;
  otherBranches: { id: string; name: string; status: StructureStatus }[];
  notices: FinanceNotice[];
}

export interface StructureSavePayload {
  termId: string;
  branchId: string;
  /** levelName → itemId → amount (null = blank / not offered). */
  amounts: Record<string, Record<string, number | null>>;
}

export interface FeesOverview {
  started: boolean;
  items: FeeItem[];
  structures: {
    termId: string;
    term: string;
    session: string;
    termStatus: string;
    branchId: string;
    branch: string;
    status: StructureStatus;
    levels: number;
    compulsoryRange: [number, number] | null;
    invoices: number;
    publishedOn: string | null;
  }[];
  notices: FinanceNotice[];
  suggested: { name: string; category: FeeCategory; charged: FeeCharged; type: FeeType }[];
  prerequisites: string[];
}

export type DiscountBasis = 'Sibling' | 'Staff child' | 'Scholarship' | 'Custom';
export interface Discount {
  id: string;
  name: string;
  basis: DiscountBasis;
  kind: 'Percentage' | 'Fixed amount';
  value: number;
  appliesTo: 'Tuition only' | 'All compulsory items';
  /** Sibling rule: which child onwards (2 or 3). */
  fromChild: number;
  needsApproval: boolean;
  status: 'Active' | 'Inactive';
  automatic: boolean;
  /** Invoices it is on this session. */
  applied: number;
  /** Naira given this session. */
  given: number;
  description: string;
}
export type DiscountPayload = Omit<
  Discount,
  'id' | 'applied' | 'given' | 'automatic' | 'description'
>;

export interface PaymentPlan {
  id: string;
  name: string;
  /** Percent per installment, summing to 100. */
  split: number[];
  /** Days after term start each installment is due. */
  offsets: number[];
  isDefault: boolean;
  status: 'Active' | 'Inactive';
  students: number;
  overdue: number;
  /** "60% on 15 Sep · 20% on 30 Nov …" for the current term. */
  schedule: string;
}
export type PaymentPlanPayload = Pick<PaymentPlan, 'name' | 'split' | 'offsets'>;

export type PaymentMethod = 'Bank transfer' | 'POS' | 'Cash' | 'Cheque' | 'Other';

export interface FinanceSettings {
  dueDates: {
    termId: string;
    term: string;
    session: string;
    start: string;
    end: string;
    due: string;
  }[];
  allowPartial: boolean;
  autoSibling: boolean;
  verifyTransfers: boolean;
  lateFee: { kind: 'None' | 'Fixed amount' | 'Percentage'; value: number };
  methods: PaymentMethod[];
  invoicePrefix: string;
  receiptPrefix: string;
  /** What parents use as the transfer narration. */
  transferReference: 'Admission number' | 'Invoice number';
  expenseLimit: number;
  refundLimit: number;
}
export type FinanceSettingsPayload = Omit<FinanceSettings, 'dueDates'> & {
  dueDates: Record<string, string>;
};

/* ---------------- Invoices ---------------- */

export type InvoiceStatus =
  'Draft' | 'Issued' | 'Partially paid' | 'Paid' | 'Overdue' | 'Cancelled';

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
  status: InvoiceStatus;
  overdue: boolean;
  issuedOn: string | null;
  dueOn: string;
  /** e.g. "Installment 2 due 30 Nov". */
  dueNote: string;
}

export interface InvoiceQuery {
  search?: string;
  term?: string;
  status?: InvoiceStatus | 'Open' | '';
  branch?: string;
  level?: string;
  session?: string;
  page?: number;
  pageSize?: number;
}

export interface InvoiceList extends Paginated<InvoiceRow> {
  summary: {
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    counts: Record<InvoiceStatus | 'All', number>;
    rate: number;
  };
  levels: string[];
  terms: { id: string; name: string; session: string }[];
  notices: FinanceNotice[];
  /** Students in the term with no invoice yet. */
  uninvoiced: number;
  lateFeeCandidates: number;
}

export interface InvoiceLine {
  id: string;
  itemId: string | null;
  label: string;
  category: FeeCategory | 'Adjustment' | 'Late fee';
  amount: number;
  optional: boolean;
  addedOn: string;
  removable: boolean;
}

export interface InvoiceDiscountLine {
  id: string;
  discountId: string | null;
  label: string;
  amount: number;
  by: string;
  approvedBy: string | null;
  reason: string;
}

export interface Installment {
  index: number;
  label: string;
  amount: number;
  due: string;
  paid: number;
  status: 'Paid' | 'Part paid' | 'Overdue' | 'Due soon' | 'Upcoming';
}

export interface AllocationRow {
  paymentId: string;
  receipt: string;
  date: string;
  method: string;
  amount: number;
  status: PaymentStatus | 'Credit applied';
  recordedBy: string;
}

export interface InvoiceDetail extends InvoiceRow {
  student: string;
  level: string;
  arm: string | null;
  lines: InvoiceLine[];
  discounts: InvoiceDiscountLine[];
  subtotal: number;
  discountTotal: number;
  plan: { id: string; name: string } | null;
  installments: Installment[];
  allocations: AllocationRow[];
  cancelled: { on: string; reason: string; by: string } | null;
  notified: boolean;
  credit: number;
  otherOpen: { id: string; no: string; term: string; balance: number; status: InvoiceStatus }[];
  optionalAvailable: { itemId: string; name: string; amount: number }[];
  discountsAvailable: {
    id: string;
    name: string;
    basis: DiscountBasis;
    amount: number;
    needsApproval: boolean;
  }[];
  plans: { id: string; name: string }[];
  payTo: PayToDetails | null;
  history: TimelineEntry[];
  canCancel: { ok: boolean; reason: string };
}

export interface PayToDetails {
  bank: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  /** Message for the parent, ready to copy or send. */
  message: string;
}

export interface GeneratePreview {
  term: { id: string; name: string; session: string; start: string };
  due: string;
  students: number;
  alreadyInvoiced: number;
  toCreate: number;
  total: number;
  discounts: number;
  levels: {
    level: string;
    branch: string;
    students: number;
    each: number;
    total: number;
    missing: boolean;
  }[];
  missingStructures: string[];
  noGuardian: number;
}

export interface GeneratePayload {
  termId: string;
  branchId?: string;
  levels?: string[];
  issue: boolean;
}

/* ---------------- Student accounts ---------------- */

export interface PayerSearchRow {
  studentKey: string;
  studentId: string | null;
  name: string;
  admissionNo: string;
  className: string;
  branch: string;
  payer: string | null;
  outstanding: number;
  credit: number;
  openInvoices: number;
}

export interface StudentAccount {
  studentKey: string;
  studentId: string | null;
  name: string;
  admissionNo: string;
  className: string;
  branch: string;
  branchId: string;
  payer: string | null;
  payerPhone: string;
  outstanding: number;
  overdue: number;
  pending: number;
  credit: number;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  refunds: RefundRow[];
  /** Statement of account, oldest first, with running balance (positive = owes). */
  statement: {
    date: string;
    ref: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  payTo: PayToDetails | null;
}

/* ---------------- Payments ---------------- */

export type PaymentStatus = 'Pending verification' | 'Confirmed' | 'Rejected';
export type PaymentSource = 'School' | 'Parent claim' | 'Statement';

export interface PaymentRow {
  id: string;
  no: string;
  date: string;
  studentKey: string;
  studentId: string | null;
  student: string;
  className: string;
  payer: string;
  method: PaymentMethod;
  reference: string;
  account: string;
  amount: number;
  status: PaymentStatus;
  source: PaymentSource;
  invoices: string[];
  /** Left over after invoices, held as credit. */
  unallocated: number;
  refunded: number;
  recordedBy: string;
}

export interface PaymentQuery {
  tab?: 'all' | 'pending';
  search?: string;
  method?: PaymentMethod | '';
  status?: PaymentStatus | '';
  source?: PaymentSource | '';
  branch?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentList extends Paginated<PaymentRow> {
  summary: {
    confirmed: number;
    confirmedCount: number;
    pending: number;
    pendingCount: number;
    rejectedCount: number;
    today: number;
    byMethod: { method: PaymentMethod; amount: number; count: number }[];
  };
}

export interface PaymentDetail extends PaymentRow {
  accountId: string;
  allocations: {
    invoiceId: string;
    no: string;
    term: string;
    amount: number;
    balanceAfter: number;
  }[];
  note: string;
  proof: string | null;
  verifiedBy: string | null;
  verifiedOn: string | null;
  rejectReason: string;
  studentCredit: number;
  refunds: RefundRow[];
  balanceNow: number;
  history: TimelineEntry[];
}

export interface PaymentPayload {
  studentKey: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  accountId: string;
  reference: string;
  payer: string;
  note: string;
  allocations: { invoiceId: string; amount: number }[];
  /** Already matched on the bank statement, so confirm now. */
  matched: boolean;
}

/* ---------------- Refunds ---------------- */

export type RefundStatus = 'Awaiting approval' | 'Approved' | 'Paid' | 'Rejected';
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
  status: RefundStatus;
  needs: 'Principal' | 'Proprietor';
}
export interface RefundDetail extends RefundRow {
  paymentId: string | null;
  payTo: string;
  paidFrom: string | null;
  paidOn: string | null;
  paidRef: string;
  rejectReason: string;
  creditBefore: number;
  history: TimelineEntry[];
}
export interface RefundPayload {
  studentKey: string;
  paymentId: string | null;
  amount: number;
  reason: string;
  payTo: string;
}

/* ---------------- Accounts ---------------- */

export interface BankAccountRow {
  id: string;
  name: string;
  kind: 'Bank' | 'Cash';
  bank: string;
  accountNumber: string;
  accountName: string;
  branchId: string | null;
  branch: string;
  showToParents: boolean;
  status: 'Active' | 'Inactive';
  balance: number;
  moneyIn: number;
  moneyOut: number;
  pending: number;
  lastActivity: string | null;
  lastStatement: string | null;
}

export interface AccountsView {
  rows: BankAccountRow[];
  total: number;
  bankTotal: number;
  cashTotal: number;
  pending: number;
  notices: FinanceNotice[];
  banks: string[];
}

export interface AccountPayload {
  name: string;
  kind: 'Bank' | 'Cash';
  bank: string;
  accountNumber: string;
  accountName: string;
  branchId: string | null;
  showToParents: boolean;
  openingBalance: number;
  openingDate: string;
}

export interface LedgerRow {
  id: string;
  date: string;
  kind: 'Payment' | 'Expense' | 'Refund' | 'Transfer in' | 'Transfer out' | 'Opening balance';
  ref: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  to: RouteLocationRaw | null;
}

export interface AccountDetail extends BankAccountRow {
  openingBalance: number;
  openingDate: string;
  ledger: Paginated<LedgerRow>;
  statements: StatementSummary[];
  monthly: { label: string; moneyIn: number; moneyOut: number }[];
}

export interface AccountTransferPayload {
  fromId: string;
  toId: string;
  amount: number;
  date: string;
  reference: string;
  note: string;
}

export type StatementMatch =
  'Matched' | 'Possible match' | 'Already recorded' | 'No match' | 'Ignored' | 'Confirmed';
export interface StatementLine {
  id: string;
  date: string;
  description: string;
  reference: string;
  credit: number;
  debit: number;
  match: StatementMatch;
  paymentId: string | null;
  paymentNo: string | null;
  student: string | null;
  note: string;
}
export interface StatementSummary {
  id: string;
  fileName: string;
  uploadedOn: string;
  uploadedBy: string;
  lines: number;
  matched: number;
  confirmed: number;
  unmatched: number;
}
export interface StatementView extends StatementSummary {
  accountId: string;
  account: string;
  rows: StatementLine[];
  pendingInAccount: {
    id: string;
    no: string;
    student: string;
    amount: number;
    date: string;
    reference: string;
  }[];
}

/* ---------------- Expenses & vendors ---------------- */

export type ExpenseStatus = 'Draft' | 'Submitted' | 'Approved' | 'Paid' | 'Rejected';
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
  status: ExpenseStatus;
  /** "Waiting for Principal". */
  waitingOn: string | null;
  submittedBy: string;
}
export interface ExpenseQuery {
  search?: string;
  status?: ExpenseStatus | '';
  category?: string;
  vendor?: string;
  branch?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export interface ExpenseList extends Paginated<ExpenseRow> {
  summary: {
    paid: number;
    approvedUnpaid: number;
    awaitingApproval: number;
    awaitingCount: number;
    drafts: number;
    counts: Record<ExpenseStatus | 'All', number>;
    byCategory: { category: string; amount: number }[];
  };
  categories: string[];
}
export interface ExpenseDetail extends ExpenseRow {
  branchId: string;
  method: PaymentMethod;
  accountId: string | null;
  account: string | null;
  paidOn: string | null;
  paidRef: string;
  attachment: { name: string; size: string } | null;
  rejectReason: string;
  notes: string;
  steps: {
    role: string;
    limit: string;
    by: string | null;
    on: string | null;
    status: 'Done' | 'Waiting' | 'Not needed' | 'Rejected';
  }[];
  canApprove: boolean;
  history: TimelineEntry[];
}
export interface ExpensePayload {
  date: string;
  category: string;
  description: string;
  vendorId: string | null;
  branchId: string;
  amount: number;
  method: PaymentMethod;
  notes: string;
  attachment: { name: string; size: string } | null;
  submit: boolean;
}
export interface PayExpensePayload {
  accountId: string;
  date: string;
  reference: string;
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
export interface VendorDetail extends VendorRow {
  address: string;
  notes: string;
  rows: ExpenseRow[];
  history: TimelineEntry[];
}
export interface VendorPayload {
  name: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  notes: string;
}

/* ---------------- Overview & reports ---------------- */

export interface FinanceOverview {
  term: { id: string; name: string; session: string };
  branch: string;
  kpis: FinanceKpi[];
  notices: FinanceNotice[];
  monthly: { label: string; income: number; expenditure: number }[];
  weekly: { label: string; value: number }[];
  sections: {
    section: string;
    students: number;
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    rate: number;
  }[];
  methods: { method: PaymentMethod; amount: number; count: number }[];
  recentPayments: PaymentRow[];
  topExpenses: { category: string; amount: number }[];
  accounts: { id: string; name: string; balance: number }[];
}

export type ReportId = 'collection' | 'outstanding' | 'income-expenditure' | 'cash-book';
export interface ReportView {
  id: ReportId;
  title: string;
  description: string;
  filters: string;
  columns: { key: string; label: string; align?: 'right'; money?: boolean; percent?: boolean }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null> | null;
}

export interface FinanceOptions {
  terms: {
    id: string;
    name: string;
    session: string;
    status: string;
    start: string;
    end: string;
  }[];
  currentTermId: string | null;
  branches: { id: string; name: string }[];
  levels: string[];
  accounts: {
    id: string;
    name: string;
    kind: 'Bank' | 'Cash';
    branchId: string | null;
    status: string;
  }[];
  methods: PaymentMethod[];
  allMethods: PaymentMethod[];
  categories: string[];
  expenseCategories: string[];
  vendors: { id: string; name: string; category: string }[];
  banks: string[];
  settings: Pick<
    FinanceSettings,
    'allowPartial' | 'verifyTransfers' | 'expenseLimit' | 'refundLimit'
  >;
}

export interface StudentFinance {
  outstanding: number;
  overdue: number;
  pending: number;
  credit: number;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  studentKey: string;
}
