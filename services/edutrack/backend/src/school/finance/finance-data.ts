import type { TenantTx } from '../shared/tenant-tx.js';
import {
  ACCOUNT_KIND,
  ACTIVE,
  DISCOUNT_APPLIES,
  DISCOUNT_BASIS,
  DISCOUNT_KIND,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUS,
  FEE_CATEGORY,
  FEE_CHARGED,
  FEE_AUDIENCE,
  FEE_TYPE,
  LATE_FEE,
  LINE_CATEGORY,
  MATCH,
  METHOD,
  PAYMENT_SOURCE,
  PAYMENT_STATUS,
  REFUND_STATUS,
  TRANSFER_REFERENCE,
  iso,
  lagosIso,
  naira,
  type DiscountBasisLabel,
  type ExpenseStatusLabel,
  type FeeCategoryLabel,
  type FeeChargedLabel,
  type FeeAudienceLabel,
  type FeeTypeLabel,
  type LineCategoryLabel,
  type MatchLabel,
  type MethodLabel,
  type PaymentSourceLabel,
  type PaymentStatusLabel,
  type RefundStatusLabel,
} from './finance-format.js';

/**
 * One school's finance, loaded from the database into the shapes the School Admin mock keeps
 * (`school-admin/src/api/mock/finance-db.ts`): naira, `YYYY-MM-DD` dates and the screens' labels.
 * Every figure the screens show is computed from this snapshot by the ledger
 * (`finance-ledger.ts`), so lists, details, the overview, reports, the dashboard and student
 * balances always agree. Writes go to the database and the next request loads them.
 */

export interface TermRef {
  id: string;
  name: string;
  session: string;
  sessionId: string;
  sessionStatus: string;
  /** Upcoming · Active · Ended · Closed. */
  status: string;
  start: string;
  end: string;
  /** 0-based position in its session ("Once a session" items are billed in the first term). */
  index: number;
  /** Term.feesDueOn (Billing settings), if set. */
  due: string | null;
}

export interface BranchRef {
  id: string;
  name: string;
  active: boolean;
}

export interface LevelRef {
  id: string;
  name: string;
  section: string;
  sectionId: string;
  /** Sort key: section order, then level order. */
  rank: number;
}

/** A student Finance bills, as they are now (current enrollment, fee payer). */
export interface FinStudent {
  key: string;
  recordId: string;
  name: string;
  firstName: string;
  admissionNo: string;
  level: string;
  levelId: string | null;
  arm: string | null;
  armId: string | null;
  branchId: string;
  payer: string | null;
  payerPhone: string;
  payerGuardianId: string | null;
  gender: 'Female' | 'Male';
  /** Still on the roll (leavers keep their invoices). */
  active: boolean;
  planId: string | null;
  /** The session the student first enrolled in (admission fees are for that session). */
  firstSessionId: string | null;
  /** sessionId → where they were that session. */
  enrollments: Map<
    string,
    { levelId: string; armId: string | null; branchId: string; active: boolean; boarding: boolean }
  >;
}

export interface FeeItemRec {
  id: string;
  name: string;
  category: FeeCategoryLabel;
  charged: FeeChargedLabel;
  type: FeeTypeLabel;
  /** Everyone, or only boarders (all, boys or girls). */
  appliesTo: FeeAudienceLabel;
  status: 'Active' | 'Archived';
  description: string;
}

export interface StructureRec {
  id: string;
  termId: string;
  branchId: string;
  status: 'Draft' | 'Published';
  publishedOn: string | null;
  /** level name → item id → naira (missing = blank). */
  amounts: Record<string, Record<string, number | null>>;
}

export interface DiscountRec {
  id: string;
  name: string;
  basis: DiscountBasisLabel;
  kind: 'Percentage' | 'Fixed amount';
  /** Percent (e.g. 10) or naira. */
  value: number;
  appliesTo: 'Tuition only' | 'All compulsory items';
  fromChild: number;
  needsApproval: boolean;
  status: 'Active' | 'Inactive';
}

export interface PlanRec {
  id: string;
  name: string;
  split: number[];
  offsets: number[];
  isDefault: boolean;
  status: 'Active' | 'Inactive';
}

export interface LineRec {
  id: string;
  itemId: string | null;
  label: string;
  category: LineCategoryLabel;
  amount: number;
  optional: boolean;
  addedOn: string;
}

export interface InvDiscountRec {
  id: string;
  discountId: string | null;
  label: string;
  amount: number;
  by: string;
  approvedBy: string | null;
  reason: string;
}

export interface InvoiceRec {
  id: string;
  no: string;
  studentKey: string;
  termId: string;
  level: string;
  levelId: string;
  arm: string | null;
  armId: string | null;
  branchId: string;
  lines: LineRec[];
  discounts: InvDiscountRec[];
  status: 'Draft' | 'Issued' | 'Cancelled';
  createdOn: string;
  issuedOn: string | null;
  dueOn: string;
  planId: string | null;
  notified: boolean;
  cancelled: { on: string; reason: string; by: string } | null;
}

export interface PaymentRec {
  id: string;
  no: string;
  date: string;
  studentKey: string;
  payer: string;
  method: MethodLabel;
  reference: string;
  accountId: string;
  branchId: string;
  amount: number;
  allocations: { invoiceId: string; amount: number }[];
  status: PaymentStatusLabel;
  source: PaymentSourceLabel;
  recordedBy: string;
  recordedOn: string;
  verifiedBy: string | null;
  verifiedOn: string | null;
  rejectReason: string;
  note: string;
  proof: string | null;
  claimedByGuardianId: string | null;
}

export interface CreditUseRec {
  id: string;
  studentKey: string;
  invoiceId: string;
  amount: number;
  date: string;
  by: string;
}

export interface RefundRec {
  id: string;
  no: string;
  studentKey: string;
  paymentId: string | null;
  amount: number;
  reason: string;
  payTo: string;
  requestedBy: string;
  requestedOn: string;
  status: RefundStatusLabel;
  approverLevel: 'Principal' | 'Proprietor';
  approvedBy: string | null;
  approvedOn: string | null;
  paidOn: string | null;
  paidFrom: string | null;
  paidRef: string;
  rejectReason: string;
}

export interface AccountRec {
  id: string;
  name: string;
  kind: 'Bank' | 'Cash';
  bank: string;
  accountNumber: string;
  accountName: string;
  branchId: string | null;
  showToParents: boolean;
  status: 'Active' | 'Inactive';
  openingBalance: number;
  openingDate: string;
}

export interface TransferRec {
  id: string;
  no: string;
  date: string;
  fromId: string;
  toId: string;
  amount: number;
  reference: string;
  note: string;
  by: string;
}

export interface StatementLineRec {
  id: string;
  lineNo: number;
  date: string;
  description: string;
  reference: string;
  credit: number;
  debit: number;
  match: MatchLabel;
  paymentId: string | null;
  note: string;
}

export interface StatementRec {
  id: string;
  accountId: string;
  fileName: string;
  uploadedOn: string;
  uploadedBy: string;
  lines: StatementLineRec[];
}

export interface VendorRec {
  id: string;
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
  status: 'Active' | 'Inactive';
}

export interface ExpenseRec {
  id: string;
  no: string;
  date: string;
  category: string;
  categoryId: string;
  description: string;
  vendorId: string | null;
  branchId: string;
  amount: number;
  method: MethodLabel;
  accountId: string | null;
  status: ExpenseStatusLabel;
  approvals: { role: 'Bursar' | 'Principal'; by: string; byId: string; on: string }[];
  submittedBy: string;
  submittedById: string | null;
  paidOn: string | null;
  paidRef: string;
  attachment: { name: string; size: string } | null;
  rejectReason: string;
  notes: string;
}

export interface FinanceSettingsRec {
  allowPartial: boolean;
  autoSibling: boolean;
  verifyTransfers: boolean;
  lateFee: { kind: 'None' | 'Fixed amount' | 'Percentage'; value: number };
  methods: MethodLabel[];
  invoicePrefix: string;
  receiptPrefix: string;
  transferReference: 'Admission number' | 'Invoice number';
  expenseLimit: number;
  refundLimit: number;
  holdReportCards: boolean;
}

export interface FinanceData {
  schoolId: string;
  /** Lagos today, `YYYY-MM-DD`. */
  today: string;
  settings: FinanceSettingsRec;
  /** Whether a FinanceSettings row exists (the defaults apply until Finance saves one). */
  hasSettings: boolean;
  terms: TermRef[];
  /** The active term, else the latest started one, else the first upcoming. */
  currentTermId: string | null;
  branches: BranchRef[];
  levels: LevelRef[];
  /** branchId → level ids the branch runs. */
  branchLevels: Map<string, string[]>;
  students: Map<string, FinStudent>;
  items: FeeItemRec[];
  structures: StructureRec[];
  discounts: DiscountRec[];
  plans: PlanRec[];
  invoices: InvoiceRec[];
  payments: PaymentRec[];
  creditUses: CreditUseRec[];
  refunds: RefundRec[];
  accounts: AccountRec[];
  transfers: TransferRec[];
  statements: StatementRec[];
  vendors: VendorRec[];
  expenses: ExpenseRec[];
  /** Defaults first, then the school's own (not archived). */
  expenseCategories: string[];
  /** Category name → id, for the ones saved in the database. */
  categoryIds: Map<string, string>;
  /** userId → display name. */
  users: Map<string, string>;
}

export const DEFAULT_SETTINGS: FinanceSettingsRec = {
  allowPartial: true,
  autoSibling: true,
  verifyTransfers: true,
  lateFee: { kind: 'None', value: 0 },
  methods: ['Bank transfer', 'POS', 'Cash'],
  invoicePrefix: 'INV',
  receiptPrefix: 'RCT',
  transferReference: 'Admission number',
  expenseLimit: 250000,
  refundLimit: 500000,
  holdReportCards: false,
};

/** Drafts carry a placeholder number until they are issued (invoices) or submitted (expenses). */
export const DRAFT_NO = 'DRAFT-';

const ON_ROLL = new Set(['ACTIVE', 'INCOMPLETE_PROFILE']);
const TERM_STATUS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  ENDED: 'Ended',
  CLOSED: 'Closed',
};
const SESSION_STATUS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  CLOSING: 'Closing',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};
const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

/** Loads the signed-in school's finance (tenant client: every query is that school's). */
export async function loadFinance(db: TenantTx, schoolId: string, now: Date): Promise<FinanceData> {
  const today = lagosIso(now);
  const [
    settingsRow,
    sessions,
    branches,
    levels,
    branchLevels,
    students,
    items,
    structures,
    discounts,
    plans,
    invoices,
    payments,
    creditUses,
    refunds,
    accounts,
    transfers,
    statements,
    vendors,
    expenses,
    categories,
  ] = await Promise.all([
    db.financeSettings.findFirst(),
    db.academicSession.findMany({
      orderBy: { startsOn: 'desc' },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    }),
    db.branch.findMany({ orderBy: [{ isOriginal: 'desc' }, { name: 'asc' }] }),
    db.classLevel.findMany({ include: { section: { select: { name: true, sortOrder: true } } } }),
    db.branchLevel.findMany({ select: { branchId: true, levelId: true } }),
    db.student.findMany({
      where: { deletedAt: null },
      include: {
        enrollments: {
          include: {
            session: { select: { startsOn: true, status: true } },
            arm: { select: { name: true } },
          },
        },
        guardians: {
          include: { guardian: { select: { id: true, title: true, fullName: true, phone: true } } },
        },
      },
    }),
    db.feeItem.findMany({ orderBy: { createdAt: 'asc' } }),
    db.feeStructure.findMany({ include: { amounts: true } }),
    db.discount.findMany({ orderBy: { createdAt: 'asc' } }),
    db.paymentPlan.findMany({
      orderBy: { createdAt: 'asc' },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    }),
    db.invoice.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        discounts: { orderBy: { createdAt: 'asc' } },
      },
    }),
    db.payment.findMany({ orderBy: { createdAt: 'asc' }, include: { allocations: true } }),
    db.creditApplication.findMany({ orderBy: { createdAt: 'asc' } }),
    db.refund.findMany({ orderBy: { createdAt: 'asc' } }),
    db.bankAccount.findMany({ orderBy: { createdAt: 'asc' } }),
    db.accountTransfer.findMany({ orderBy: { createdAt: 'asc' } }),
    db.bankStatement.findMany({
      orderBy: { createdAt: 'asc' },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    }),
    db.vendor.findMany({ orderBy: { createdAt: 'asc' } }),
    db.expense.findMany({ orderBy: { createdAt: 'asc' }, include: { approvals: true } }),
    db.expenseCategory.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  /* ---------- People: who did what ---------- */

  const userIds = new Set<string>();
  const want = (id: string | null | undefined) => id && userIds.add(id);
  for (const i of invoices) {
    want(i.cancelledById);
    want(i.createdById);
    for (const d of i.discounts) {
      want(d.appliedById);
      want(d.approvedById);
    }
  }
  for (const p of payments) {
    want(p.recordedById);
    want(p.verifiedById);
  }
  for (const c of creditUses) want(c.appliedById);
  for (const r of refunds) {
    want(r.requestedById);
    want(r.approvedById);
  }
  for (const t of transfers) want(t.createdById);
  for (const s of statements) want(s.uploadedById);
  for (const e of expenses) {
    want(e.submittedById);
    for (const a of e.approvals) want(a.approvedById);
  }
  const userRows = userIds.size
    ? await db.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const users = new Map(userRows.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const who = (id: string | null | undefined) => (id ? (users.get(id) ?? 'EduTrack') : 'EduTrack');

  /* ---------- Academic frame ---------- */

  const terms: TermRef[] = sessions.flatMap((s) =>
    s.terms.map((t, index) => ({
      id: t.id,
      name: t.name,
      session: s.name,
      sessionId: s.id,
      sessionStatus: SESSION_STATUS[s.status] ?? s.status,
      status: TERM_STATUS[t.status] ?? t.status,
      start: iso(t.startsOn),
      end: iso(t.endsOn),
      index,
      due: t.feesDueOn ? iso(t.feesDueOn) : null,
    })),
  );
  const active = terms.find((t) => t.status === 'Active');
  const started = terms
    .filter((t) => t.start <= today)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  const upcoming = terms
    .filter((t) => t.start > today)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const currentTermId = (active ?? started ?? upcoming)?.id ?? null;

  const levelRefs: LevelRef[] = levels
    .map((l) => ({
      id: l.id,
      name: l.name,
      section: l.section.name,
      sectionId: l.sectionId,
      rank: l.section.sortOrder * 1000 + l.sortOrder,
    }))
    .sort((a, b) => a.rank - b.rank);
  const levelName = new Map(levelRefs.map((l) => [l.id, l.name]));
  const byBranch = new Map<string, string[]>();
  for (const bl of branchLevels)
    byBranch.set(bl.branchId, [...(byBranch.get(bl.branchId) ?? []), bl.levelId]);
  for (const [k, ids] of byBranch)
    byBranch.set(
      k,
      [...ids].sort(
        (a, b) =>
          (levelRefs.find((l) => l.id === a)?.rank ?? 0) -
          (levelRefs.find((l) => l.id === b)?.rank ?? 0),
      ),
    );

  /* ---------- Students ---------- */

  const activeSession = sessions.find((s) => s.status === 'ACTIVE');
  const studentMap = new Map<string, FinStudent>();
  for (const s of students) {
    const ordered = [...s.enrollments].sort(
      (a, b) => b.session.startsOn.getTime() - a.session.startsOn.getTime(),
    );
    const current =
      (activeSession && ordered.find((e) => e.sessionId === activeSession.id)) ?? ordered[0];
    const links = s.guardians;
    const payerLink =
      links.find((l) => l.paysFees) ?? links.find((l) => l.isPrimary) ?? links[0] ?? null;
    studentMap.set(s.id, {
      key: s.id,
      recordId: s.id,
      name: `${s.firstName} ${s.surname}`.trim(),
      firstName: s.firstName,
      admissionNo: s.admissionNo,
      level: current ? (levelName.get(current.levelId) ?? '') : '',
      levelId: current?.levelId ?? null,
      arm: current?.arm?.name ?? null,
      armId: current?.armId ?? null,
      branchId: current?.branchId ?? s.branchId,
      payer: payerLink ? guardianName(payerLink.guardian) : null,
      payerPhone: payerLink?.guardian.phone ?? '',
      payerGuardianId: payerLink?.guardian.id ?? null,
      gender: s.gender === 'FEMALE' ? 'Female' : 'Male',
      active: ON_ROLL.has(s.status),
      planId: s.paymentPlanId,
      firstSessionId: ordered[ordered.length - 1]?.sessionId ?? null,
      enrollments: new Map(
        s.enrollments.map((e) => [
          e.sessionId,
          {
            levelId: e.levelId,
            armId: e.armId,
            branchId: e.branchId,
            active: e.status === 'ACTIVE',
            boarding: e.boarding,
          },
        ]),
      ),
    });
  }

  /* ---------- Fees ---------- */

  const settings: FinanceSettingsRec = settingsRow
    ? {
        allowPartial: settingsRow.allowPartial,
        autoSibling: settingsRow.autoSibling,
        verifyTransfers: settingsRow.verifyTransfers,
        lateFee: {
          kind: LATE_FEE[settingsRow.lateFeeKind],
          value:
            settingsRow.lateFeeKind === 'PERCENTAGE'
              ? Number(settingsRow.lateFeeValue) / 100
              : naira(settingsRow.lateFeeValue),
        },
        methods: settingsRow.enabledMethods.length
          ? settingsRow.enabledMethods.map((m) => METHOD[m])
          : [...DEFAULT_SETTINGS.methods],
        invoicePrefix: settingsRow.invoicePrefix,
        receiptPrefix: settingsRow.receiptPrefix,
        transferReference: TRANSFER_REFERENCE[settingsRow.transferReference],
        expenseLimit: settingsRow.expenseLimitKobo
          ? naira(settingsRow.expenseLimitKobo)
          : DEFAULT_SETTINGS.expenseLimit,
        refundLimit: settingsRow.refundLimitKobo
          ? naira(settingsRow.refundLimitKobo)
          : DEFAULT_SETTINGS.refundLimit,
        holdReportCards: settingsRow.holdReportCards,
      }
    : { ...DEFAULT_SETTINGS, methods: [...DEFAULT_SETTINGS.methods] };

  const levelOf = (id: string) => levelName.get(id) ?? '';

  const lineCategory = LINE_CATEGORY;
  const data: FinanceData = {
    schoolId,
    today,
    settings,
    hasSettings: !!settingsRow,
    terms,
    currentTermId,
    branches: branches.map((b) => ({ id: b.id, name: b.name, active: b.status === 'ACTIVE' })),
    levels: levelRefs,
    branchLevels: byBranch,
    students: studentMap,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      category: FEE_CATEGORY[i.category],
      charged: FEE_CHARGED[i.charged],
      type: FEE_TYPE[i.type],
      appliesTo: FEE_AUDIENCE[i.appliesTo],
      status: i.status === 'ACTIVE' ? 'Active' : 'Archived',
      description: i.description,
    })),
    structures: structures.map((st) => {
      const amounts: Record<string, Record<string, number | null>> = {};
      for (const a of st.amounts) {
        const name = levelOf(a.levelId);
        (amounts[name] ??= {})[a.feeItemId] = naira(a.amountKobo);
      }
      return {
        id: st.id,
        termId: st.termId,
        branchId: st.branchId,
        status: st.status === 'PUBLISHED' ? 'Published' : 'Draft',
        publishedOn: st.publishedAt ? lagosIso(st.publishedAt) : null,
        amounts,
      };
    }),
    discounts: discounts.map((d) => ({
      id: d.id,
      name: d.name,
      basis: DISCOUNT_BASIS[d.basis],
      kind: DISCOUNT_KIND[d.kind],
      value: d.kind === 'PERCENTAGE' ? Number(d.value) / 100 : naira(d.value),
      appliesTo: DISCOUNT_APPLIES[d.appliesTo],
      fromChild: d.fromChild ?? 2,
      needsApproval: d.needsApproval,
      status: ACTIVE[d.status],
    })),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      split: p.installments.map((i) => i.shareBp / 100),
      offsets: p.installments.map((i) => i.offsetDays),
      isDefault: p.isDefault,
      status: ACTIVE[p.status],
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      no: i.number.startsWith(DRAFT_NO) ? '' : i.number,
      studentKey: i.studentId,
      termId: i.termId,
      level: levelOf(i.levelId),
      levelId: i.levelId,
      arm: null as string | null,
      armId: i.armId,
      branchId: i.branchId,
      lines: i.lines.map((l) => ({
        id: l.id,
        itemId: l.feeItemId,
        label: l.label,
        category: lineCategory[l.category],
        amount: naira(l.amountKobo),
        optional: l.isOptional,
        addedOn: lagosIso(l.createdAt),
      })),
      discounts: i.discounts.map((d) => ({
        id: d.id,
        discountId: d.discountId,
        label: d.label,
        amount: naira(d.amountKobo),
        by: d.appliedById
          ? who(d.appliedById)
          : d.reason.startsWith('Automatic')
            ? d.reason
            : 'Automatic',
        approvedBy: d.approvedById ? who(d.approvedById) : null,
        reason: d.appliedById ? d.reason : '',
      })),
      status: i.status === 'DRAFT' ? 'Draft' : i.status === 'CANCELLED' ? 'Cancelled' : 'Issued',
      createdOn: lagosIso(i.createdAt),
      issuedOn: i.issuedOn ? iso(i.issuedOn) : null,
      dueOn: iso(i.dueOn),
      planId: i.paymentPlanId,
      notified: !!i.notifiedAt,
      cancelled: i.cancelledAt
        ? { on: lagosIso(i.cancelledAt), reason: i.cancelReason ?? '', by: who(i.cancelledById) }
        : null,
    })),
    payments: [],
    creditUses: creditUses.map((c) => ({
      id: c.id,
      studentKey: c.studentId,
      invoiceId: c.invoiceId,
      amount: naira(c.amountKobo),
      date: iso(c.appliedOn),
      by: who(c.appliedById),
    })),
    refunds: refunds.map((r) => ({
      id: r.id,
      no: r.number,
      studentKey: r.studentId,
      paymentId: r.paymentId,
      amount: naira(r.amountKobo),
      reason: r.reason,
      payTo: r.payTo,
      requestedBy: who(r.requestedById),
      requestedOn: lagosIso(r.requestedAt),
      status: REFUND_STATUS[r.status],
      approverLevel: r.approverLevel === 'PROPRIETOR' ? 'Proprietor' : 'Principal',
      approvedBy: r.approvedById
        ? r.approverLevel === 'PROPRIETOR'
          ? `the Proprietor (recorded by ${who(r.approvedById)})`
          : who(r.approvedById)
        : null,
      approvedOn: r.approvedAt ? lagosIso(r.approvedAt) : null,
      paidOn: r.paidAt ? lagosIso(r.paidAt) : null,
      paidFrom: r.paidFromAccountId,
      paidRef: r.paidReference ?? '',
      rejectReason: r.rejectReason ?? '',
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: ACCOUNT_KIND[a.kind],
      bank: a.bankName ?? '',
      accountNumber: a.accountNumber ?? '',
      accountName: a.accountName ?? '',
      branchId: a.branchId,
      showToParents: a.showToParents,
      status: ACTIVE[a.status],
      openingBalance: naira(a.openingBalanceKobo),
      openingDate: iso(a.openingOn),
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      no: t.number,
      date: iso(t.transferredOn),
      fromId: t.fromAccountId,
      toId: t.toAccountId,
      amount: naira(t.amountKobo),
      reference: t.reference,
      note: t.note,
      by: who(t.createdById),
    })),
    statements: statements.map((s) => ({
      id: s.id,
      accountId: s.bankAccountId,
      fileName: s.fileName,
      uploadedOn: lagosIso(s.createdAt),
      uploadedBy: who(s.uploadedById),
      lines: s.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        date: iso(l.postedOn),
        description: l.description,
        reference: l.reference,
        credit: naira(l.creditKobo),
        debit: naira(l.debitKobo),
        match: MATCH[l.match],
        paymentId: l.paymentId,
        note: l.note,
      })),
    })),
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      contactName: v.contactName ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      address: v.address ?? '',
      bank: v.bankName ?? '',
      accountNumber: v.accountNumber ?? '',
      accountName: v.accountName ?? '',
      notes: v.notes,
      status: ACTIVE[v.status],
    })),
    expenses: [],
    expenseCategories: [],
    categoryIds: new Map(categories.map((c) => [c.name, c.id])),
    users,
  };

  // Invoice arms: the arm's name from the student's enrollment that session.
  const armNames = new Map<string, string>();
  for (const s of students)
    for (const e of s.enrollments) if (e.arm) armNames.set(e.armId!, e.arm.name);
  for (const i of data.invoices) i.arm = i.armId ? (armNames.get(i.armId) ?? null) : null;
  if (data.invoices.some((i) => i.armId && !i.arm)) {
    const missing = [
      ...new Set(data.invoices.filter((i) => i.armId && !i.arm).map((i) => i.armId!)),
    ];
    const arms = await db.classArm.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true },
    });
    for (const a of arms) armNames.set(a.id, a.name);
    for (const i of data.invoices) i.arm = i.armId ? (armNames.get(i.armId) ?? null) : null;
  }

  const guardianNames = new Map<string, string>();
  for (const s of students)
    for (const l of s.guardians) guardianNames.set(l.guardian.id, guardianName(l.guardian));
  data.payments = payments.map((p) => ({
    id: p.id,
    no: p.number,
    date: iso(p.paidOn),
    studentKey: p.studentId,
    payer: p.payerName,
    method: METHOD[p.method],
    reference: p.reference,
    accountId: p.bankAccountId,
    branchId: p.branchId,
    amount: naira(p.amountKobo),
    allocations: p.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amount: naira(a.amountKobo),
    })),
    status: PAYMENT_STATUS[p.status],
    source: PAYMENT_SOURCE[p.source],
    recordedBy: p.recordedById
      ? who(p.recordedById)
      : p.claimedByGuardianId
        ? `${guardianNames.get(p.claimedByGuardianId) ?? p.payerName} · Parent Portal`
        : 'EduTrack',
    recordedOn: lagosIso(p.createdAt),
    verifiedBy: p.verifiedById ? who(p.verifiedById) : null,
    verifiedOn: p.verifiedAt ? lagosIso(p.verifiedAt) : null,
    rejectReason: p.rejectReason ?? '',
    note: p.note,
    proof: p.proofName,
    claimedByGuardianId: p.claimedByGuardianId,
  }));

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  data.expenses = expenses.map((e) => ({
    id: e.id,
    no: e.number.startsWith(DRAFT_NO) ? '' : e.number,
    date: iso(e.spentOn),
    category: categoryName.get(e.categoryId) ?? 'Other',
    categoryId: e.categoryId,
    description: e.description,
    vendorId: e.vendorId,
    branchId: e.branchId,
    amount: naira(e.amountKobo),
    method: METHOD[e.method],
    accountId: e.paidFromAccountId,
    status: EXPENSE_STATUS[e.status],
    approvals: [...e.approvals]
      .sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime())
      .map((a) => ({
        role: a.role === 'BURSAR' ? ('Bursar' as const) : ('Principal' as const),
        by: who(a.approvedById),
        byId: a.approvedById,
        on: lagosIso(a.approvedAt),
      })),
    submittedBy: who(e.submittedById),
    submittedById: e.submittedById,
    paidOn: e.paidAt ? iso(e.paidAt) : null,
    paidRef: e.paidReference ?? '',
    attachment: e.attachmentName ? { name: e.attachmentName, size: e.attachmentSize ?? '' } : null,
    rejectReason: e.rejectReason ?? '',
    notes: e.notes,
  }));
  const custom = categories.filter((c) => !c.archivedAt).map((c) => c.name);
  data.expenseCategories = [
    ...EXPENSE_CATEGORIES,
    ...custom.filter((c) => !EXPENSE_CATEGORIES.some((d) => d.toLowerCase() === c.toLowerCase())),
  ];
  return data;
}
