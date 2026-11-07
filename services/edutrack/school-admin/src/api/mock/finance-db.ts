/*
 * Finance data for the mock API, per school. Greenfield's term is generated: every enrolled
 * student is billed from the published First Term fee structure, sibling and staff-child
 * discounts are applied by rule, and payments, parent claims, refunds, expenses and transfers are
 * produced deterministically, so the overview, reports and every balance are computed, not typed.
 * Crestview starts empty and sets Finance up from the Setup Center.
 */
import type {
  DiscountBasis,
  ExpenseStatus,
  FeeCategory,
  FeeCharged,
  FeeType,
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  RefundStatus,
  StatementMatch,
  TimelineEntry,
} from '@/types';

import { academicsData, armLabel, seeded, type LevelRec } from './academics-db';
import {
  addDays,
  allocateOldestFirst,
  installmentsFor,
  isoToday,
  levelRank,
  roundTo,
  siblingPositions,
  sum,
  totalOf,
} from './finance-ledger';
import { schoolData } from './school-db';
import { studentsData } from './students-db';

/* ---------------- Records ---------------- */

export interface FeeItemRec {
  id: string;
  name: string;
  category: FeeCategory;
  charged: FeeCharged;
  type: FeeType;
  status: 'Active' | 'Archived';
  description: string;
}

export interface StructureRec {
  termId: string;
  branchId: string;
  status: 'Draft' | 'Published';
  publishedOn: string | null;
  /** level name → item id → naira (null = blank / not offered). */
  amounts: Record<string, Record<string, number | null>>;
  history: TimelineEntry[];
}

export interface DiscountRec {
  id: string;
  name: string;
  basis: DiscountBasis;
  kind: 'Percentage' | 'Fixed amount';
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

/** A student Finance bills: a Students-section record, or one of the rest of the roll. */
export interface FinStudent {
  key: string;
  recordId: string | null;
  name: string;
  admissionNo: string;
  level: string;
  arm: string | null;
  branchId: string;
  payer: string | null;
  payerPhone: string;
  isNew: boolean;
  /** Still enrolled (left students keep their invoices). */
  active: boolean;
}

export interface LineRec {
  id: string;
  itemId: string | null;
  label: string;
  category: FeeCategory | 'Adjustment' | 'Late fee';
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
  arm: string | null;
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
  history: TimelineEntry[];
}

export interface PaymentRec {
  id: string;
  no: string;
  date: string;
  studentKey: string;
  payer: string;
  method: PaymentMethod;
  reference: string;
  accountId: string;
  amount: number;
  allocations: { invoiceId: string; amount: number }[];
  status: PaymentStatus;
  source: PaymentSource;
  recordedBy: string;
  recordedOn: string;
  verifiedBy: string | null;
  verifiedOn: string | null;
  rejectReason: string;
  note: string;
  proof: string | null;
  history: TimelineEntry[];
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
  status: RefundStatus;
  approvedBy: string | null;
  approvedOn: string | null;
  paidOn: string | null;
  paidFrom: string | null;
  paidRef: string;
  rejectReason: string;
  history: TimelineEntry[];
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
  date: string;
  description: string;
  reference: string;
  credit: number;
  debit: number;
  match: StatementMatch;
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
  history: TimelineEntry[];
}

export interface ExpenseRec {
  id: string;
  no: string;
  date: string;
  category: string;
  description: string;
  vendorId: string | null;
  branchId: string;
  amount: number;
  method: PaymentMethod;
  accountId: string | null;
  status: ExpenseStatus;
  approvals: { role: string; by: string; on: string }[];
  submittedBy: string;
  paidOn: string | null;
  paidRef: string;
  attachment: { name: string; size: string } | null;
  rejectReason: string;
  notes: string;
  history: TimelineEntry[];
}

export interface FinanceSettingsRec {
  dueDates: Record<string, string>;
  allowPartial: boolean;
  autoSibling: boolean;
  verifyTransfers: boolean;
  lateFee: { kind: 'None' | 'Fixed amount' | 'Percentage'; value: number };
  methods: PaymentMethod[];
  invoicePrefix: string;
  receiptPrefix: string;
  transferReference: 'Admission number' | 'Invoice number';
  expenseLimit: number;
  refundLimit: number;
}

export interface FinanceData {
  schoolId: string;
  settings: FinanceSettingsRec;
  items: FeeItemRec[];
  structures: StructureRec[];
  discounts: DiscountRec[];
  plans: PlanRec[];
  /** Students beyond the Students-section records (the rest of the roll). */
  students: FinStudent[];
  invoices: InvoiceRec[];
  payments: PaymentRec[];
  creditUses: CreditUseRec[];
  refunds: RefundRec[];
  accounts: AccountRec[];
  transfers: TransferRec[];
  statements: StatementRec[];
  vendors: VendorRec[];
  expenses: ExpenseRec[];
  expenseCategories: string[];
  reminders: { date: string; count: number; channel: string; by: string }[];
  /** The Setup Center Fees step was marked complete. */
  confirmed: boolean;
  /** Plan per student (studentKey → plan id) when it differs from the default. */
  studentPlans: Record<string, string>;
  seq: Record<string, number>;
  /** Every finance student (records first), cached until the roll changes. */
  studentIndex: () => Map<string, FinStudent>;
}

/* ---------------- Reference data ---------------- */

export const BANKS = [
  'Access Bank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank',
  'FCMB',
  'GTBank',
  'Keystone Bank',
  'Moniepoint MFB',
  'Opay',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC',
  'Sterling Bank',
  'UBA',
  'Union Bank',
  'Wema Bank',
  'Zenith Bank',
];

export const ALL_METHODS: PaymentMethod[] = ['Bank transfer', 'POS', 'Cash', 'Cheque', 'Other'];
export const FEE_CATEGORIES: FeeCategory[] = [
  'Tuition',
  'Levy',
  'Exams',
  'ICT',
  'Books',
  'Uniform',
  'Transport',
  'Feeding',
  'Boarding',
  'Activities',
  'Admission',
  'Other',
];
export const EXPENSE_CATEGORIES = [
  'Maintenance',
  'Utilities',
  'Fuel',
  'Internet',
  'Stationery',
  'Laboratory',
  'Events',
  'Transport',
  'Security',
  'Cleaning',
  'ICT',
  'Catering',
  'Other',
];

/** Suggested fee items for a new school, with typical amounts per section code. */
export const SUGGESTED_ITEMS: [
  name: string,
  category: FeeCategory,
  charged: FeeCharged,
  type: FeeType,
  amounts: Record<string, number>,
][] = [
  [
    'Tuition',
    'Tuition',
    'Every term',
    'Compulsory',
    { NUR: 120000, PRI: 150000, JSS: 220000, SSS: 250000 },
  ],
  [
    'Development levy',
    'Levy',
    'Once a session',
    'Compulsory',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'Examination fee',
    'Exams',
    'Every term',
    'Compulsory',
    { NUR: 8000, PRI: 15000, JSS: 15000, SSS: 15000 },
  ],
  [
    'ICT fee',
    'ICT',
    'Every term',
    'Compulsory',
    { NUR: 10000, PRI: 10000, JSS: 10000, SSS: 10000 },
  ],
  [
    'PTA levy',
    'Levy',
    'Once a session',
    'Compulsory',
    { NUR: 5000, PRI: 5000, JSS: 5000, SSS: 5000 },
  ],
  [
    'Admission fee',
    'Admission',
    'New students only',
    'Compulsory',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'Textbooks',
    'Books',
    'Once a session',
    'Optional',
    { NUR: 20000, PRI: 30000, JSS: 45000, SSS: 45000 },
  ],
  [
    'Uniform',
    'Uniform',
    'New students only',
    'Optional',
    { NUR: 30000, PRI: 30000, JSS: 30000, SSS: 30000 },
  ],
  [
    'School bus',
    'Transport',
    'Every term',
    'Optional',
    { NUR: 60000, PRI: 60000, JSS: 60000, SSS: 60000 },
  ],
  [
    'Lunch',
    'Feeding',
    'Every term',
    'Optional',
    { NUR: 45000, PRI: 45000, JSS: 45000, SSS: 45000 },
  ],
];

export const defaultSettings = (): FinanceSettingsRec => ({
  dueDates: {},
  allowPartial: true,
  autoSibling: true,
  verifyTransfers: true,
  lateFee: { kind: 'None', value: 0 },
  methods: ['Bank transfer', 'POS', 'Cash'],
  invoicePrefix: 'INV',
  receiptPrefix: 'RCP',
  transferReference: 'Admission number',
  expenseLimit: 250000,
  refundLimit: 500000,
});

export const DEFAULT_PLANS = (): PlanRec[] => [
  {
    id: 'plan-full',
    name: 'Pay in full',
    split: [100],
    offsets: [14],
    isDefault: true,
    status: 'Active',
  },
  {
    id: 'plan-2',
    name: 'Two installments',
    split: [60, 40],
    offsets: [14, 42],
    isDefault: false,
    status: 'Active',
  },
];

/* ---------------- Builders ---------------- */

const ACTOR = 'Kunle Bakare';

export const pad = (n: number, w = 4) => String(n).padStart(w, '0');
export function nextNo(fin: FinanceData, prefix: string, year: string) {
  const key = `${prefix}-${year}`;
  fin.seq[key] = (fin.seq[key] ?? 0) + 1;
  return `${prefix}-${year}-${pad(fin.seq[key]!, prefix === 'RFD' ? 3 : 4)}`;
}
export const nextId = (fin: FinanceData, kind: string) => {
  fin.seq[`id-${kind}`] = (fin.seq[`id-${kind}`] ?? 0) + 1;
  return `${kind}${fin.seq[`id-${kind}`]}`;
};

/** Students-section records as Finance sees them, with the guardian who pays. */
export function recordStudents(schoolId: string): FinStudent[] {
  const sd = studentsData[schoolId]!;
  const branches = schoolData[schoolId]!.branches;
  return sd.students.map((s) => {
    const gs = sd.guardians.filter((g) => g.children[s.id]);
    const g =
      gs.find((x) => x.children[s.id]!.paysFees) ??
      gs.find((x) => x.children[s.id]!.primary) ??
      gs[0];
    return {
      key: s.id,
      recordId: s.id,
      name: `${s.firstName} ${s.surname}`.trim(),
      admissionNo: s.admissionNo,
      level: s.level,
      arm: s.arm,
      branchId: branches.find((b) => b.name === s.branch)?.id ?? branches[0]?.id ?? '',
      payer: g?.name ?? null,
      payerPhone: g?.phone ?? '',
      isNew: s.admissionNo.startsWith('STU-2026') && s.id !== 'aisha',
      active: ['Active', 'Incomplete profile'].includes(s.status),
    };
  });
}

function makeIndex(fin: FinanceData) {
  let synthCount = -1;
  let synth = new Map<string, FinStudent>();
  return () => {
    if (synthCount !== fin.students.length) {
      synth = new Map(fin.students.map((s) => [s.key, s]));
      synthCount = fin.students.length;
    }
    const map = new Map<string, FinStudent>();
    for (const r of recordStudents(fin.schoolId)) map.set(r.key, r);
    for (const [k, v] of synth) map.set(k, v);
    return map;
  };
}

function emptyFinance(schoolId: string): FinanceData {
  const fin: FinanceData = {
    schoolId,
    settings: defaultSettings(),
    items: [],
    structures: [],
    discounts: [],
    plans: DEFAULT_PLANS(),
    students: [],
    invoices: [],
    payments: [],
    creditUses: [],
    refunds: [],
    accounts: [],
    transfers: [],
    statements: [],
    vendors: [],
    expenses: [],
    expenseCategories: [...EXPENSE_CATEGORIES],
    reminders: [],
    confirmed: false,
    studentPlans: {},
    seq: {},
    studentIndex: () => new Map(),
  };
  fin.studentIndex = makeIndex(fin);
  return fin;
}

/** Section code of a class level ("JSS 2" → JSS). */
export const levelSection = (level: string) =>
  /nursery/i.test(level)
    ? 'NUR'
    : /^primary/i.test(level)
      ? 'PRI'
      : /^jss/i.test(level)
        ? 'JSS'
        : 'SSS';

export const structureFor = (fin: FinanceData, termId: string, branchId: string) =>
  fin.structures.find((s) => s.termId === termId && s.branchId === branchId);

/** Whether a fee item is charged in a term, given the term's position in its session. */
export function chargedIn(item: FeeItemRec, termIndex: number, isNew: boolean) {
  if (item.charged === 'Every term') return true;
  if (item.charged === 'Once a session') return termIndex === 0;
  return isNew;
}

export interface TermRef {
  id: string;
  name: string;
  session: string;
  start: string;
  end: string;
  index: number;
}

/** Every term the school has, newest session first. */
export function termsOf(schoolId: string): TermRef[] {
  return academicsData[schoolId]!.sessions.flatMap((s) =>
    s.terms.map((t, index) => ({
      id: t.id,
      name: t.name,
      session: s.name,
      start: t.start,
      end: t.end,
      index,
    })),
  );
}

export const dueDateFor = (fin: FinanceData, term: TermRef) =>
  fin.settings.dueDates[term.id] ?? addDays(term.start, 14);

/**
 * Builds a student's invoice for a term from the published structure: compulsory items charged
 * that term (admission-type items only for new students), then automatic sibling discounts.
 * Returns null when the student's level has no structure amounts.
 */
export function buildInvoice(
  fin: FinanceData,
  student: FinStudent,
  term: TermRef,
  opts: { siblings: Map<string, { position: number; eldest: string }>; on: string; by: string },
): InvoiceRec | null {
  const st = structureFor(fin, term.id, student.branchId);
  const amounts = st?.amounts[student.level];
  // Only a published structure bills students; drafts are still being reviewed.
  if (!st || st.status !== 'Published' || !amounts) return null;
  const lines: LineRec[] = [];
  for (const item of fin.items) {
    if (item.status !== 'Active' || item.type !== 'Compulsory') continue;
    if (!chargedIn(item, term.index, student.isNew)) continue;
    const amount = amounts[item.id];
    if (!amount) continue;
    lines.push({
      id: `ln${lines.length + 1}`,
      itemId: item.id,
      label: item.name,
      category: item.category,
      amount,
      optional: false,
      addedOn: opts.on,
    });
  }
  if (!lines.length) return null;
  const inv: InvoiceRec = {
    id: nextId(fin, 'inv'),
    no: '',
    studentKey: student.key,
    termId: term.id,
    level: student.level,
    arm: student.arm,
    branchId: student.branchId,
    lines,
    discounts: [],
    status: 'Draft',
    createdOn: opts.on,
    issuedOn: null,
    dueOn: dueDateFor(fin, term),
    planId: fin.studentPlans[student.key] ?? fin.plans.find((p) => p.isDefault)?.id ?? null,
    notified: false,
    cancelled: null,
    history: [
      {
        id: 'h1',
        title: 'Invoice created from the fee structure',
        detail: opts.by,
        when: opts.on,
        tone: 'info',
      },
    ],
  };
  const sib = fin.discounts.find((d) => d.basis === 'Sibling' && d.status === 'Active');
  const pos = opts.siblings.get(student.key);
  if (fin.settings.autoSibling && sib && pos && pos.position >= sib.fromChild) {
    const amount = discountAmount(fin, inv, sib);
    if (amount > 0)
      inv.discounts.push({
        id: 'd1',
        discountId: sib.id,
        label: `${sib.name} · ${ordinal(pos.position)} child`,
        amount,
        by: `Automatic · sibling of ${pos.eldest}`,
        approvedBy: null,
        reason: '',
      });
  }
  return inv;
}

export const ordinal = (n: number) =>
  `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** What a discount takes off an invoice: a % or fixed amount of tuition or all compulsory lines. */
export function discountAmount(fin: FinanceData, inv: InvoiceRec, d: DiscountRec, custom?: number) {
  const base = sum(
    inv.lines
      .filter((l) => {
        const item = fin.items.find((i) => i.id === l.itemId);
        return d.appliesTo === 'Tuition only'
          ? item?.category === 'Tuition'
          : !!item && item.type === 'Compulsory';
      })
      .map((l) => l.amount),
  );
  const raw = custom ?? (d.kind === 'Percentage' ? Math.round((base * d.value) / 100) : d.value);
  return Math.max(0, Math.min(raw, base, totalOf(inv)));
}

export function issueInvoice(
  fin: FinanceData,
  inv: InvoiceRec,
  on: string,
  by: string,
  notified: boolean,
) {
  const term = termsOf(fin.schoolId).find((t) => t.id === inv.termId)!;
  inv.status = 'Issued';
  inv.issuedOn = on;
  inv.no = nextNo(fin, fin.settings.invoicePrefix, term.session.slice(0, 4));
  if (inv.dueOn < on) inv.dueOn = addDays(on, 14);
  inv.notified = notified;
  inv.history.push({
    id: `h${inv.history.length + 1}`,
    title: notified ? 'Issued and sent to the fee payer' : 'Issued · no guardian to notify',
    detail: notified ? `${by} · Email and SMS` : by,
    when: on,
    tone: 'info',
  });
}

/* ---------------- Greenfield seed ---------------- */

const BOYS = [
  'Chidi',
  'Tunde',
  'Ifeanyi',
  'Musa',
  'Segun',
  'Emeka',
  'Kunle',
  'Uche',
  'Bayo',
  'Yakubu',
  'Femi',
  'Obinna',
  'Sani',
  'Dayo',
  'Kelechi',
  'Abubakar',
  'Tobi',
  'Ikenna',
  'Olumide',
  'Nnamdi',
  'Gbenga',
  'Jide',
  'Usman',
  'Chinedu',
  'Seyi',
];
const GIRLS = [
  'Adaeze',
  'Funmi',
  'Amaka',
  'Zainab',
  'Ngozi',
  'Bisola',
  'Halima',
  'Chioma',
  'Kemi',
  'Aisha',
  'Ifeoma',
  'Temi',
  'Nkechi',
  'Hauwa',
  'Yetunde',
  'Ebere',
  'Folake',
  'Amina',
  'Ronke',
  'Oluchi',
  'Fatima',
  'Simi',
  'Uju',
  'Bukola',
  'Damilola',
];
const SURNAMES = [
  'Okafor',
  'Adebayo',
  'Bello',
  'Eze',
  'Ogunleye',
  'Ibrahim',
  'Nwachukwu',
  'Olatunji',
  'Danjuma',
  'Okoro',
  'Afolabi',
  'Umar',
  'Chukwu',
  'Adeleke',
  'Nnaji',
  'Garba',
  'Oyelaran',
  'Obi',
  'Akande',
  'Yusuf',
  'Ezeh',
  'Bassey',
  'Ajayi',
  'Lawal',
  'Okeke',
  'Adewale',
  'Mohammed',
  'Onyekachi',
  'Fashola',
  'Etim',
  'Salami',
  'Uzor',
  'Akinola',
  'Ekwueme',
  'Abdullahi',
  'Ogbonna',
  'Shittu',
  'Edet',
  'Balogun',
  'Nwosu',
];
const DADS = [
  'Chukwudi',
  'Babatunde',
  'Ahmed',
  'Emeka',
  'Olumide',
  'Ibrahim',
  'Kayode',
  'Ikechukwu',
  'Sola',
  'Yusuf',
  'Tochukwu',
  'Wale',
];
const MUMS = [
  'Ngozi',
  'Funke',
  'Hauwa',
  'Bisi',
  'Chinwe',
  'Amina',
  'Lola',
  'Joy',
  'Nkechi',
  'Ronke',
  'Patience',
  'Grace',
];

const R = (key: string) => seeded(key);
const pick = <T>(xs: T[], r: number) => xs[Math.floor(r * xs.length) % xs.length]!;

/** First Term 2026/2027 amounts at Main Campus, from the design's fee structure table. */
const GF_AMOUNTS: Record<
  string,
  [
    tuition: number,
    levy: number,
    exam: number,
    books: number,
    uniform: number | null,
    clubs: number | null,
  ]
> = {
  NURSERY: [95000, 10000, 0, 12000, 18000, 8000],
  PRI_LOW: [110000, 15000, 5000, 15000, 22000, 10000],
  PRI_HIGH: [120000, 15000, 5000, 17000, 22000, 10000],
  JSS: [140000, 15000, 10000, 20000, 26000, 12000],
  SSS: [155000, 15000, 12000, 24000, 28000, 12000],
  SSS3: [155000, 15000, 45000, 24000, null, null],
};
const gfBand = (level: string) =>
  /nursery/i.test(level)
    ? 'NURSERY'
    : /^Primary [123]$/.test(level)
      ? 'PRI_LOW'
      : level.startsWith('Primary')
        ? 'PRI_HIGH'
        : level.startsWith('JSS')
          ? 'JSS'
          : level === 'SSS 3'
            ? 'SSS3'
            : 'SSS';

const GF_ITEMS: FeeItemRec[] = [
  {
    id: 'fi-tuition',
    name: 'Tuition',
    category: 'Tuition',
    charged: 'Every term',
    type: 'Compulsory',
    status: 'Active',
    description: 'Teaching for the term.',
  },
  {
    id: 'fi-levy',
    name: 'Development levy',
    category: 'Levy',
    charged: 'Every term',
    type: 'Compulsory',
    status: 'Active',
    description: 'Buildings, furniture and equipment.',
  },
  {
    id: 'fi-exam',
    name: 'Examination fee',
    category: 'Exams',
    charged: 'Every term',
    type: 'Compulsory',
    status: 'Active',
    description: 'Termly exams; WAEC/NECO registration for SSS 3.',
  },
  {
    id: 'fi-books',
    name: 'Books & learning materials',
    category: 'Books',
    charged: 'Every term',
    type: 'Compulsory',
    status: 'Active',
    description: '',
  },
  {
    id: 'fi-admission',
    name: 'Admission fee',
    category: 'Admission',
    charged: 'New students only',
    type: 'Compulsory',
    status: 'Active',
    description: 'Charged once, on a new student’s first invoice.',
  },
  {
    id: 'fi-uniform',
    name: 'Uniforms',
    category: 'Uniform',
    charged: 'Every term',
    type: 'Optional',
    status: 'Active',
    description: 'On request.',
  },
  {
    id: 'fi-clubs',
    name: 'Clubs & activities',
    category: 'Activities',
    charged: 'Every term',
    type: 'Optional',
    status: 'Active',
    description: '',
  },
  {
    id: 'fi-bus',
    name: 'School bus',
    category: 'Transport',
    charged: 'Every term',
    type: 'Optional',
    status: 'Active',
    description: 'Ikeja and Lekki routes.',
  },
];

function gfStructure(
  fin: FinanceData,
  termId: string,
  branchId: string,
  levels: string[],
  factor: number,
  on: string,
) {
  const amounts: StructureRec['amounts'] = {};
  for (const level of levels) {
    const [t, l, e, b, u, c] = GF_AMOUNTS[gfBand(level)]!;
    const tuition = t + (branchId === 'lk' && level.startsWith('Primary') ? 10000 : 0);
    const f = (n: number | null) => (n === null ? null : roundTo(n * factor, 500));
    amounts[level] = {
      'fi-tuition': f(tuition),
      'fi-levy': f(l),
      // 0 = not charged for this class (no exams in Nursery); blank = not set yet.
      'fi-exam': f(e),
      'fi-books': f(b),
      'fi-admission': 25000,
      'fi-uniform': f(u),
      'fi-clubs': f(c),
      'fi-bus': 60000,
    };
  }
  fin.structures.push({
    termId,
    branchId,
    status: 'Published',
    publishedOn: on,
    amounts,
    history: [{ id: 'h1', title: 'Published', detail: 'Kunle Bakare', when: on, tone: 'success' }],
  });
}

const PHONE = (key: string) =>
  `+234 80${pick(['3', '5', '6', '8'], R(key + 'pa'))} 555 ${pad(Math.floor(R(key + 'pb') * 10000))}`;

/** The rest of the roll: each arm filled to its enrolment, up to each branch's student count. */
function gfRoll(fin: FinanceData) {
  const acad = academicsData.greenfield!;
  const school = schoolData.greenfield!;
  const records = recordStudents('greenfield').filter((s) => s.active);
  const baseline = studentsData.greenfield!.armBaseline;
  let n = 0;
  let lastPayer: { name: string; phone: string; surname: string } | null = null;
  for (const branch of school.branches.filter((b) => b.status === 'Active')) {
    const levels = acad.levels.filter((l) => l.branchId === branch.id);
    const arms = levels.flatMap((lv) => lv.arms.map((arm) => ({ lv, arm })));
    const label = (lv: LevelRec, arm: string) => armLabel(lv.name, arm);
    const recCount = (lv: LevelRec, arm: string) =>
      records.filter((s) => s.branchId === branch.id && s.level === lv.name && s.arm === arm)
        .length;
    const known = (lv: LevelRec, arm: { arm: string; baseline: number }) =>
      branch.id === 'mc'
        ? label(lv, arm.arm) in baseline
          ? recCount(lv, arm.arm) + baseline[label(lv, arm.arm)]!
          : null
        : arm.baseline;
    const unplaced = records.filter((s) => s.branchId === branch.id && !s.arm).length;
    const fixed = sum(arms.map(({ lv, arm }) => known(lv, arm) ?? 0)) + unplaced;
    const open = arms.filter(({ lv, arm }) => known(lv, arm) === null);
    let left = Math.max(0, branch.students - fixed);
    const target = new Map<string, number>();
    for (const { lv, arm } of arms) target.set(arm.id, known(lv, arm) ?? recCount(lv, arm.arm));
    // Spread the rest over arms with no known count, then top every arm up to capacity.
    for (const pool of [open, arms])
      while (left > 0 && pool.some(({ arm }) => target.get(arm.id)! < arm.capacity)) {
        for (const { arm } of pool) {
          if (left <= 0) break;
          if (target.get(arm.id)! >= arm.capacity) continue;
          target.set(arm.id, target.get(arm.id)! + 1);
          left--;
        }
      }
    for (const { lv, arm } of arms) {
      const extra = target.get(arm.id)! - recCount(lv, arm.arm);
      for (let i = 0; i < extra; i++) {
        n++;
        const key = `x-${n}`;
        const girl = R(key + 'g') < 0.5;
        const sibling: boolean = !!lastPayer && R(key + 's') < 0.08;
        const surname = sibling ? lastPayer!.surname : pick(SURNAMES, R(key + 'sn'));
        const first = pick(girl ? GIRLS : BOYS, R(key + 'fn'));
        const payer: { name: string; phone: string; surname: string } = sibling
          ? lastPayer!
          : {
              name:
                R(key + 'pm') < 0.55
                  ? `Mrs. ${pick(MUMS, R(key + 'mm'))} ${surname}`
                  : `Mr. ${pick(DADS, R(key + 'dd'))} ${surname}`,
              phone: PHONE(key),
              surname,
            };
        lastPayer = payer;
        const rank = levelRank(lv.name);
        const year = Math.min(
          2026,
          2026 - Math.max(0, Math.floor((rank - 2) * 0.55)) + (R(key + 'y') < 0.3 ? 1 : 0),
        );
        const isNew = R(key + 'new') < 0.07 || year === 2026;
        fin.students.push({
          key,
          recordId: null,
          name: `${first} ${surname}`,
          admissionNo: `STU-${isNew ? 2026 : year}-${pad(2000 + n)}`,
          level: lv.name,
          arm: arm.arm,
          branchId: branch.id,
          // About 1 in 70 has no guardian linked yet.
          payer: R(key + 'ng') < 0.014 ? null : payer.name,
          payerPhone: payer.phone,
          isNew,
          active: true,
        });
      }
    }
  }
}

interface PaySpec {
  amount: number;
  date: string;
  method: PaymentMethod;
  status?: PaymentStatus;
  source?: PaymentSource;
  ref?: string;
  proof?: string;
  rejectReason?: string;
  by?: string;
}

/** Explicit payments for the Students-section records, so their balances match the design. */
const RECORD_PAYMENTS: Record<string, PaySpec[]> = {
  emmanuel: [
    { amount: 105000, date: '2026-09-08', method: 'Bank transfer', ref: 'GTB/2026/09/08/40112' },
  ],
  favour: [
    { amount: 92500, date: '2026-09-10', method: 'POS', ref: 'POS-218831' },
    { amount: 92500, date: '2026-10-30', method: 'POS', ref: 'POS-240117' },
  ],
  chiamaka: [
    {
      amount: 195000,
      date: '2026-09-04',
      method: 'Bank transfer',
      ref: 'FBN/NIP/77120931',
      by: 'Kemi Lawal',
    },
  ],
  sarah: [
    { amount: 140000, date: '2026-09-12', method: 'Bank transfer', ref: 'ACC/NIP/66104422' },
    {
      amount: 45000,
      date: '2026-11-04',
      method: 'Bank transfer',
      status: 'Pending verification',
      source: 'Parent claim',
      ref: 'ACC88231',
      proof: 'transfer-receipt-sarah.jpg',
      by: 'Mrs. Hauwa Ibrahim',
    },
  ],
  david: [
    { amount: 185000, date: '2026-09-03', method: 'Bank transfer', ref: 'GTB/2026/09/03/11873' },
  ],
  tolulope: [
    { amount: 92500, date: '2026-09-15', method: 'Bank transfer', ref: 'UBA/NIP/55120034' },
  ],
  ibrahim: [{ amount: 185000, date: '2026-09-01', method: 'Cash' }],
  kelechi: [
    { amount: 185000, date: '2026-08-28', method: 'Bank transfer', ref: 'ZEN/NIP/30014587' },
  ],
  samuel: [
    { amount: 100000, date: '2026-09-07', method: 'Bank transfer', ref: 'GTB/2026/09/07/22810' },
    { amount: 85000, date: '2026-10-05', method: 'Cheque', ref: 'CHQ 004512' },
  ],
  precious: [
    { amount: 100000, date: '2026-09-14', method: 'Bank transfer', ref: 'ZEN/NIP/30112044' },
    { amount: 65000, date: '2026-10-21', method: 'POS', ref: 'POS-236602' },
    {
      amount: 20000,
      date: '2026-11-05',
      method: 'Bank transfer',
      status: 'Pending verification',
      source: 'Parent claim',
      ref: 'ZEN44102',
      proof: 'zenith-alert.png',
      by: 'Mr. Effiong Udoh',
    },
  ],
  yusuf: [
    { amount: 185000, date: '2026-09-02', method: 'Bank transfer', ref: 'JAIZ/NIP/10045521' },
  ],
  michael: [
    { amount: 100000, date: '2026-09-05', method: 'Bank transfer', ref: 'GTB/2026/09/05/31877' },
    { amount: 47000, date: '2026-09-30', method: 'Cash' },
  ],
  seun: [{ amount: 179000, date: '2026-09-11', method: 'Bank transfer', ref: 'STB/NIP/88104221' }],
  halima: [
    { amount: 206000, date: '2026-09-09', method: 'Bank transfer', ref: 'UBA/NIP/55100988' },
  ],
  amarachi: [{ amount: 145000, date: '2026-09-06', method: 'POS', ref: 'POS-219004' }],
  tobi: [{ amount: 82000, date: '2026-09-16', method: 'Cash' }],
  ruth: [
    { amount: 210000, date: '2026-08-26', method: 'Bank transfer', ref: 'GTB/2026/08/26/10022' },
  ],
  tunde: [{ amount: 210000, date: '2026-08-27', method: 'Bank transfer', ref: 'ACC/NIP/66010023' }],
  ngozi: [{ amount: 210000, date: '2026-08-29', method: 'POS', ref: 'POS-217760' }],
  bola: [{ amount: 210000, date: '2026-09-01', method: 'Bank transfer', ref: 'FBN/NIP/77100431' }],
};

const SECTION_RATES: Record<string, [full: number, partial: number]> = {
  NUR: [0.88, 0.95],
  PRI: [0.8, 0.9],
  JSS: [0.76, 0.88],
  SSS: [0.74, 0.86],
};

const BANK_PREFIX = ['GTB', 'ACC', 'ZEN', 'UBA', 'FBN', 'STB', 'FCMB', 'WEMA'];

function seedGreenfield(): FinanceData {
  const fin = emptyFinance('greenfield');
  const acad = academicsData.greenfield!;
  const school = schoolData.greenfield!;
  fin.confirmed = false;
  fin.settings = {
    ...defaultSettings(),
    dueDates: { 't-2026-1': '2026-09-15', 't-2025-3': '2026-05-04' },
    lateFee: { kind: 'Fixed amount', value: 5000 },
    methods: ['Bank transfer', 'POS', 'Cash', 'Cheque'],
  };
  fin.items = structuredClone(GF_ITEMS);
  fin.discounts = [
    {
      id: 'dc-sibling',
      name: 'Sibling discount',
      basis: 'Sibling',
      kind: 'Fixed amount',
      value: 10000,
      appliesTo: 'Tuition only',
      fromChild: 2,
      needsApproval: false,
      status: 'Active',
    },
    {
      id: 'dc-staff',
      name: 'Staff child',
      basis: 'Staff child',
      kind: 'Percentage',
      value: 50,
      appliesTo: 'Tuition only',
      fromChild: 2,
      needsApproval: true,
      status: 'Active',
    },
    {
      id: 'dc-scholar',
      name: 'Academic scholarship',
      basis: 'Scholarship',
      kind: 'Percentage',
      value: 100,
      appliesTo: 'Tuition only',
      fromChild: 2,
      needsApproval: true,
      status: 'Active',
    },
    {
      id: 'dc-special',
      name: 'Special concession',
      basis: 'Custom',
      kind: 'Fixed amount',
      value: 20000,
      appliesTo: 'All compulsory items',
      fromChild: 2,
      needsApproval: true,
      status: 'Active',
    },
  ];
  fin.plans = [
    {
      id: 'plan-full',
      name: 'Pay in full',
      split: [100],
      offsets: [1],
      isDefault: true,
      status: 'Active',
    },
    {
      id: 'plan-3',
      name: 'Three installments',
      split: [60, 20, 20],
      offsets: [1, 77, 92],
      isDefault: false,
      status: 'Active',
    },
    {
      id: 'plan-monthly',
      name: 'Monthly (approved cases)',
      split: [25, 25, 25, 25],
      offsets: [1, 31, 62, 92],
      isDefault: false,
      status: 'Active',
    },
  ];
  fin.accounts = [
    {
      id: 'acc-gtb',
      name: 'Fees collection · Main Campus',
      kind: 'Bank',
      bank: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'Greenfield Academy Ltd',
      branchId: 'mc',
      showToParents: true,
      status: 'Active',
      openingBalance: 4250000,
      openingDate: '2026-08-01',
    },
    {
      id: 'acc-zen',
      name: 'Fees collection · Lekki Campus',
      kind: 'Bank',
      bank: 'Zenith Bank',
      accountNumber: '1014523987',
      accountName: 'Greenfield Academy Ltd – Lekki',
      branchId: 'lk',
      showToParents: true,
      status: 'Active',
      openingBalance: 1870000,
      openingDate: '2026-08-01',
    },
    {
      id: 'acc-ops',
      name: 'Operations account',
      kind: 'Bank',
      bank: 'Access Bank',
      accountNumber: '0698765432',
      accountName: 'Greenfield Academy Ltd',
      branchId: null,
      showToParents: false,
      status: 'Active',
      openingBalance: 12400000,
      openingDate: '2026-08-01',
    },
    {
      id: 'acc-cash-mc',
      name: 'Cash office · Main Campus',
      kind: 'Cash',
      bank: '',
      accountNumber: '',
      accountName: '',
      branchId: 'mc',
      showToParents: false,
      status: 'Active',
      openingBalance: 185000,
      openingDate: '2026-08-01',
    },
    {
      id: 'acc-cash-lk',
      name: 'Cash office · Lekki',
      kind: 'Cash',
      bank: '',
      accountNumber: '',
      accountName: '',
      branchId: 'lk',
      showToParents: false,
      status: 'Active',
      openingBalance: 60000,
      openingDate: '2026-08-01',
    },
  ];

  const terms = termsOf('greenfield');
  const first = terms.find((t) => t.id === 't-2026-1')!;
  const prev = terms.find((t) => t.id === 't-2025-3')!;
  for (const b of ['mc', 'lk']) {
    const levels = [...new Set(acad.levels.filter((l) => l.branchId === b).map((l) => l.name))];
    gfStructure(fin, first.id, b, levels, 1, '2026-08-24');
    gfStructure(fin, prev.id, b, levels, 0.95, '2026-04-06');
  }

  gfRoll(fin);
  const students = [...fin.studentIndex().values()];
  // Plans: a quarter of families pay in installments.
  for (const s of students) {
    const r = R(s.key + 'plan');
    if (s.key === 'emmanuel') fin.studentPlans[s.key] = 'plan-3';
    else if (s.recordId) continue;
    else if (r < 0.36) fin.studentPlans[s.key] = 'plan-3';
    else if (r < 0.41) fin.studentPlans[s.key] = 'plan-monthly';
  }

  // Invoices: First Term for everyone enrolled, issued 1 Sep, in class order.
  const siblings = siblingPositions(students.filter((s) => s.active));
  const order = [...students]
    .filter((s) => s.active || s.key === 'ahmed')
    .sort(
      (a, b) =>
        a.branchId.localeCompare(b.branchId) ||
        levelRank(a.level) - levelRank(b.level) ||
        (a.arm ?? 'Z').localeCompare(b.arm ?? 'Z') ||
        a.name.localeCompare(b.name),
    );
  const firstInv = new Map<string, InvoiceRec>();
  for (const s of order) {
    if (s.key === 'aisha') continue;
    const inv = buildInvoice(
      fin,
      s.key === 'ahmed' ? { ...s, level: 'SSS 3', arm: 'B' } : s,
      first,
      { siblings, on: '2026-08-28', by: ACTOR },
    );
    if (!inv) continue;
    issueInvoice(fin, inv, '2026-09-01', ACTOR, !!s.payer);
    fin.invoices.push(inv);
    firstInv.set(s.key, inv);
  }
  // Keep the design's invoice number for Emmanuel.
  const em = firstInv.get('emmanuel');
  const holder = fin.invoices.find((i) => i.no === 'INV-2026-0418');
  if (em && holder && holder !== em) [holder.no, em.no] = [em.no, holder.no];

  // Aisha Lawal joined late with no guardian linked.
  const aisha = students.find((s) => s.key === 'aisha');
  if (aisha) {
    const inv = buildInvoice(fin, aisha, first, { siblings, on: '2026-11-02', by: ACTOR })!;
    inv.dueOn = '2026-11-16';
    issueInvoice(fin, inv, '2026-11-02', ACTOR, false);
    fin.invoices.push(inv);
    firstInv.set('aisha', inv);
  }

  // Staff-child and scholarship discounts, approved.
  const synth = students.filter((s) => !s.recordId && firstInv.has(s.key));
  const applyManual = (s: FinStudent, discountId: string, approvedBy: string, reason: string) => {
    const inv = firstInv.get(s.key)!;
    const d = fin.discounts.find((x) => x.id === discountId)!;
    const amount = discountAmount(fin, inv, d);
    inv.discounts.push({
      id: `d${inv.discounts.length + 1}`,
      discountId,
      label: d.name,
      amount,
      by: approvedBy,
      approvedBy,
      reason,
    });
  };
  synth
    .filter((s) => R(s.key + 'staff') < 0.012)
    .forEach((s) => applyManual(s, 'dc-staff', 'Kunle Bakare', 'Child of active staff'));
  synth
    .filter((s) => s.level.startsWith('SSS') && R(s.key + 'sch') < 0.015)
    .slice(0, 3)
    .forEach((s) => applyManual(s, 'dc-scholar', 'Adaeze Okonkwo', 'Top 3 in the entrance exam'));

  // Last session's arrears (2025/2026 Third Term), still payable.
  const arrears: [FinStudent, number][] = [];
  const emStudent = students.find((s) => s.key === 'emmanuel');
  if (emStudent) arrears.push([{ ...emStudent, level: 'JSS 1', arm: 'B' }, 15000]);
  for (const s of synth)
    if (!s.isNew && R(s.key + 'arr') < 0.035)
      arrears.push([s, roundTo(15000 + R(s.key + 'arra') * 80000, 5000)]);
  const prevInv = new Map<string, InvoiceRec>();
  for (const [s, owed] of arrears) {
    const prevLevel = s.key === 'emmanuel' ? 'JSS 1' : s.level;
    const inv = buildInvoice(fin, { ...s, level: prevLevel, isNew: false }, prev, {
      siblings: new Map(),
      on: '2026-04-10',
      by: ACTOR,
    });
    if (!inv) continue;
    issueInvoice(fin, inv, '2026-04-13', ACTOR, !!s.payer);
    inv.planId = 'plan-full';
    fin.invoices.push(inv);
    prevInv.set(s.key, inv);
    (inv as InvoiceRec & { _owed?: number })._owed = owed;
  }
  if (emStudent) {
    const inv = prevInv.get('emmanuel');
    if (inv) inv.no = 'INV-2025-1187';
  }

  // Payments.
  const recorder = (branchId: string, method: PaymentMethod) =>
    branchId === 'lk' ? 'Tolu Adebayo' : method === 'Cash' ? 'Kemi Lawal' : ACTOR;
  const accountFor = (branchId: string, method: PaymentMethod) =>
    method === 'Cash'
      ? branchId === 'lk'
        ? 'acc-cash-lk'
        : 'acc-cash-mc'
      : branchId === 'lk'
        ? 'acc-zen'
        : 'acc-gtb';
  const refFor = (key: string, method: PaymentMethod, date: string) =>
    method === 'Bank transfer'
      ? `${pick(BANK_PREFIX, R(key + 'bk'))}/NIP/${pad(Math.floor(R(key + 'rf') * 1e8), 8)}`
      : method === 'POS'
        ? `POS-${200000 + Math.floor(R(key + date) * 99999)}`
        : method === 'Cheque'
          ? `CHQ ${pad(Math.floor(R(key + 'cq') * 1e6), 6)}`
          : '';
  const pay = (s: FinStudent, spec: PaySpec, invoices: InvoiceRec[]) => {
    const status = spec.status ?? 'Confirmed';
    const open = invoices.map((i) => ({ id: i.id, balance: totalOf(i) - paidSoFar(i.id) }));
    const allocations = allocateOldestFirst(open, spec.amount);
    const source = spec.source ?? 'School';
    const by = spec.by ?? recorder(s.branchId, spec.method);
    const p: PaymentRec = {
      id: nextId(fin, 'pay'),
      no: '',
      date: spec.date,
      studentKey: s.key,
      payer: s.payer ?? 'Walk-in payer',
      method: spec.method,
      reference: spec.ref ?? refFor(s.key, spec.method, spec.date),
      accountId: accountFor(s.branchId, spec.method),
      amount: spec.amount,
      allocations,
      status,
      source,
      recordedBy: by,
      recordedOn: spec.date,
      verifiedBy: status === 'Confirmed' && spec.method === 'Bank transfer' ? ACTOR : null,
      verifiedOn: status === 'Confirmed' && spec.method === 'Bank transfer' ? spec.date : null,
      rejectReason: spec.rejectReason ?? '',
      note: '',
      proof: spec.proof ?? null,
      history: [],
    };
    if (status === 'Confirmed')
      for (const a of allocations) paid.set(a.invoiceId, (paid.get(a.invoiceId) ?? 0) + a.amount);
    fin.payments.push(p);
    return p;
  };
  const paid = new Map<string, number>();
  const paidSoFar = (id: string) => paid.get(id) ?? 0;

  for (const s of students) {
    const cur = firstInv.get(s.key);
    const old = prevInv.get(s.key);
    if (old) {
      const owed = (old as InvoiceRec & { _owed?: number })._owed ?? 0;
      pay(
        s,
        {
          amount: totalOf(old) - owed,
          date: '2026-05-0' + (1 + Math.floor(R(s.key + 'od') * 8)),
          method: 'Bank transfer',
        },
        [old],
      );
      delete (old as InvoiceRec & { _owed?: number })._owed;
    }
    if (!cur) continue;
    const specs = RECORD_PAYMENTS[s.key];
    if (specs) {
      for (const spec of specs) pay(s, spec, [cur]);
      continue;
    }
    if (s.recordId) continue;
    const total = totalOf(cur);
    const [full, partial] = SECTION_RATES[levelSection(s.level)]!;
    const r = R(s.key + 'pay');
    const method: PaymentMethod = (() => {
      const m = R(s.key + 'm');
      return m < 0.62 ? 'Bank transfer' : m < 0.82 ? 'POS' : m < 0.95 ? 'Cash' : 'Cheque';
    })();
    const plan = fin.plans.find((p) => p.id === cur.planId);
    let amount = 0;
    const dates: string[] = [];
    if (plan && plan.split.length > 1) {
      const sched = installmentsFor(cur, plan, first.start, total, 0, isoToday());
      const due = sched.filter((x) => x.due <= '2026-11-05');
      const onTrack = r < 0.86;
      const count = onTrack ? due.length : Math.max(0, due.length - 1);
      amount = sum(sched.slice(0, count).map((x) => x.amount));
      if (!onTrack && r < 0.9) amount += roundTo(sched[count]!.amount * 0.5, 500);
      sched
        .slice(0, Math.max(1, count))
        .forEach((x) => dates.push(addDays(x.due, -Math.floor(R(s.key + x.index) * 6))));
    } else if (r < full) {
      amount = total;
      dates.push(addDays('2026-08-24', Math.floor(R(s.key + 'd1') * 38)));
      if (R(s.key + 'two') < 0.3)
        dates.push(addDays('2026-09-20', Math.floor(R(s.key + 'd2') * 40)));
    } else if (r < partial) {
      amount = roundTo(total * (0.35 + R(s.key + 'pp') * 0.4), 5000);
      dates.push(addDays('2026-09-01', Math.floor(R(s.key + 'd1') * 45)));
    }
    if (amount <= 0) continue;
    const parts =
      dates.length > 1 && !(plan && plan.split.length > 1) ? [roundTo(amount * 0.6, 500), 0] : null;
    if (parts) parts[1] = amount - parts[0]!;
    const amounts =
      parts ??
      (plan && plan.split.length > 1
        ? splitBySchedule(amount, cur, plan, first.start, dates.length)
        : [amount]);
    amounts.forEach((a, i) => {
      if (a > 0)
        pay(
          s,
          {
            amount: a,
            date: dates[i] ?? dates[0]!,
            method: i === 0 ? method : R(s.key + 'm2') < 0.5 ? 'Bank transfer' : 'POS',
          },
          [cur],
        );
    });
  }

  // Recent transfers waiting for verification: some recorded by staff, some claimed by parents.
  const pendingFrom = synth.filter((s) => {
    const inv = firstInv.get(s.key);
    return inv && totalOf(inv) - paidSoFar(inv.id) > 20000 && R(s.key + 'pend') < 0.012;
  });
  pendingFrom.slice(0, 5).forEach((s, i) => {
    const inv = firstInv.get(s.key)!;
    const amount = roundTo(
      Math.min(totalOf(inv) - paidSoFar(inv.id), 30000 + R(s.key + 'pv') * 90000),
      5000,
    );
    const claim = i % 2 === 0;
    pay(
      s,
      {
        amount,
        date: addDays('2026-11-02', i % 4),
        method: 'Bank transfer',
        status: 'Pending verification',
        source: claim ? 'Parent claim' : 'School',
        ref: `${pick(BANK_PREFIX, R(s.key + 'pb'))}${pad(Math.floor(R(s.key + 'pr') * 100000), 5)}`,
        proof: claim ? 'payment-screenshot.jpg' : undefined,
        by: claim ? (s.payer ?? 'Parent') : ACTOR,
      },
      [inv],
    );
  });
  // Two parent claims the bank statement didn't support.
  synth
    .filter((s) => R(s.key + 'rej') < 0.004)
    .slice(0, 2)
    .forEach((s, i) => {
      const inv = firstInv.get(s.key)!;
      pay(
        s,
        {
          amount: 50000,
          date: addDays('2026-10-20', i * 6),
          method: 'Bank transfer',
          status: 'Rejected',
          source: 'Parent claim',
          ref: `UBA${pad(Math.floor(R(s.key + 'rr') * 100000), 5)}`,
          rejectReason:
            i === 0
              ? 'Not found on the bank statement'
              : 'Amount on the statement is ₦5,000, not ₦50,000',
          proof: 'receipt.jpg',
          by: s.payer ?? 'Parent',
        },
        [inv],
      );
    });

  // Receipt numbers in date order.
  [...fin.payments]
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, 'en', { numeric: true }),
    )
    .forEach((p) => {
      p.no = nextNo(fin, fin.settings.receiptPrefix, p.date.slice(0, 4));
      p.history = [
        {
          id: 'h1',
          title: p.source === 'Parent claim' ? `Payment claimed by ${p.payer}` : 'Payment recorded',
          detail: `${p.recordedBy} · ${p.method}`,
          when: p.date,
          tone: 'info',
        },
        ...(p.status === 'Confirmed' && p.verifiedBy
          ? [
              {
                id: 'h2',
                title: 'Verified on the bank statement',
                detail: p.verifiedBy,
                when: p.verifiedOn!,
                tone: 'success' as const,
              },
            ]
          : []),
        ...(p.status === 'Rejected'
          ? [
              {
                id: 'h2',
                title: 'Rejected',
                detail: `${ACTOR} · ${p.rejectReason}`,
                when: addDays(p.date, 2),
                tone: 'error' as const,
              },
            ]
          : []),
      ];
    });

  // Chiamaka paid ₦10,000 too much: a refund is waiting for approval.
  const chiPay = fin.payments.find((p) => p.studentKey === 'chiamaka');
  if (chiPay)
    fin.refunds.push({
      id: nextId(fin, 'rf'),
      no: nextNo(fin, 'RFD', '2026'),
      studentKey: 'chiamaka',
      paymentId: chiPay.id,
      amount: 10000,
      reason: 'Examination fee paid twice',
      payTo: 'GTBank ****4410 · Ngozi Eze',
      requestedBy: ACTOR,
      requestedOn: '2026-11-02',
      status: 'Awaiting approval',
      approvedBy: null,
      approvedOn: null,
      paidOn: null,
      paidFrom: null,
      paidRef: '',
      rejectReason: '',
      history: [
        {
          id: 'h1',
          title: 'Refund requested',
          detail: `${ACTOR} · ₦10,000 credit on account`,
          when: '2026-11-02',
          tone: 'info',
        },
      ],
    });
  // Ahmed Sani withdrew before resumption: invoice cancelled, ₦60,000 refunded.
  const ahInv = firstInv.get('ahmed');
  const ahmed = students.find((s) => s.key === 'ahmed');
  if (ahInv && ahmed) {
    const p = pay(
      ahmed,
      { amount: 60000, date: '2026-08-30', method: 'Bank transfer', ref: 'GTB/2026/08/30/10551' },
      [ahInv],
    );
    p.no = nextNo(fin, fin.settings.receiptPrefix, '2026');
    ahInv.status = 'Cancelled';
    ahInv.cancelled = {
      on: '2026-09-10',
      reason: 'Withdrawn before resumption',
      by: 'Adaeze Okonkwo',
    };
    ahInv.history.push({
      id: 'h9',
      title: 'Cancelled',
      detail: 'Adaeze Okonkwo · Withdrawn before resumption',
      when: '2026-09-10',
      tone: 'neutral',
    });
    fin.refunds.push({
      id: nextId(fin, 'rf'),
      no: nextNo(fin, 'RFD', '2026'),
      studentKey: 'ahmed',
      paymentId: p.id,
      amount: 60000,
      reason: 'Withdrawn before resumption (Ahmed Sani)',
      payTo: 'UBA ****1189 · Alhaji Sani Bello',
      requestedBy: ACTOR,
      requestedOn: '2026-09-11',
      status: 'Paid',
      approvedBy: 'Adaeze Okonkwo',
      approvedOn: '2026-09-12',
      paidOn: '2026-09-14',
      paidFrom: 'acc-gtb',
      paidRef: 'GTB/RFD/2026/09/14',
      rejectReason: '',
      history: [
        { id: 'h1', title: 'Refund requested', detail: ACTOR, when: '2026-09-11', tone: 'info' },
        {
          id: 'h2',
          title: 'Approved',
          detail: 'Adaeze Okonkwo · within ₦500,000 limit',
          when: '2026-09-12',
          tone: 'success',
        },
        {
          id: 'h3',
          title: 'Paid out',
          detail: `${ACTOR} · from Fees collection · Main Campus`,
          when: '2026-09-14',
          tone: 'success',
        },
      ],
    });
  }

  seedOperations(
    fin,
    school.branches.map((b) => b.id),
  );
  return fin;
}

/** Payments for a plan family, one per installment that was due. */
function splitBySchedule(
  amount: number,
  inv: InvoiceRec,
  plan: PlanRec,
  start: string,
  count: number,
) {
  const sched = installmentsFor(inv, plan, start, totalOf(inv), 0, isoToday());
  const out: number[] = [];
  let left = amount;
  for (let i = 0; i < Math.max(1, count); i++) {
    const take = i === Math.max(1, count) - 1 ? left : Math.min(left, sched[i]!.amount);
    out.push(take);
    left -= take;
  }
  return out;
}

const V = (
  id: string,
  name: string,
  category: string,
  contactName: string,
  phone: string,
  bank: string,
  accountNumber: string,
  status: 'Active' | 'Inactive' = 'Active',
): VendorRec => ({
  id,
  name,
  category,
  contactName,
  phone,
  email: '',
  address: '',
  bank,
  accountNumber,
  accountName: bank === 'Direct debit' ? '' : name,
  notes: '',
  status,
  history: [{ id: 'h1', title: 'Vendor added', detail: ACTOR, when: '2026-08-03', tone: 'info' }],
});

/** Vendors, expenses with their approvals, and money moved between accounts. */
function seedOperations(fin: FinanceData, branchIds: string[]) {
  fin.vendors = [
    V(
      'v-lekki',
      'Lekki Stationers Ltd',
      'Stationery',
      'Mr. Ade Bello',
      '0803 555 0321',
      'GTBank',
      '0412782210',
    ),
    V(
      'v-ardova',
      'Ardova Plc',
      'Fuel',
      'Accounts desk',
      '0700 555 0100',
      'Zenith Bank',
      '1013549013',
    ),
    V(
      'v-labtech',
      'Labtech Nigeria',
      'Laboratory',
      'Mrs. Joy Uche',
      '0802 555 0410',
      'Access Bank',
      '0698807781',
    ),
    V(
      'v-uniform',
      'Uniform House',
      'Uniforms',
      'Mr. Femi Ola',
      '0805 555 0170',
      'UBA',
      '2087143302',
    ),
    V(
      'v-spectranet',
      'Spectranet',
      'Internet',
      'Corporate support',
      '0700 555 0200',
      'Direct debit',
      '',
    ),
    V(
      'v-powergen',
      'PowerGen Services Ltd',
      'Maintenance',
      'Engr. Tunde Bassey',
      '0809 555 0133',
      'First Bank',
      '3091186620',
    ),
    V(
      'v-okon',
      'Okon & Sons Works',
      'Maintenance',
      'Mr. Effiong Okon',
      '0806 555 0177',
      'Fidelity Bank',
      '6230145578',
    ),
    V(
      'v-trophy',
      'Trophy World',
      'Events',
      'Mrs. Kemi Ade',
      '0803 555 0191',
      'Sterling Bank',
      '0071234498',
    ),
    V(
      'v-ikeja',
      'Ikeja Electric',
      'Utilities',
      'Customer care',
      '0700 555 0300',
      'Direct debit',
      '',
    ),
    V(
      'v-safeguard',
      'SafeGuard Security Services',
      'Security',
      'Mr. John Ekpo',
      '0802 555 0164',
      'Polaris Bank',
      '1771230045',
    ),
    V(
      'v-cleanpro',
      'CleanPro Facility Services',
      'Cleaning',
      'Mrs. Ruth Ojo',
      '0807 555 0118',
      'Wema Bank',
      '0234567801',
    ),
    V(
      'v-water',
      'Lagos Water Corporation',
      'Utilities',
      'Billing office',
      '0700 555 0400',
      'Direct debit',
      '',
    ),
    V(
      'v-mamaput',
      'Mama Put Catering',
      'Catering',
      'Mrs. Bola Ade',
      '0805 555 0122',
      'Opay',
      '8031234567',
      'Inactive',
    ),
  ];
  type E = [
    date: string,
    category: string,
    description: string,
    vendor: string | null,
    branch: string,
    amount: number,
    status: ExpenseStatus,
    method?: PaymentMethod,
    extra?: Partial<ExpenseRec>,
  ];
  const rows: E[] = [
    ['2026-08-22', 'Stationery', 'Uniform stock · new session', 'v-uniform', 'mc', 1840000, 'Paid'],
    [
      '2026-08-26',
      'Stationery',
      'Textbooks restock · JSS and SSS',
      'v-lekki',
      'mc',
      620000,
      'Paid',
    ],
    ['2026-09-18', 'Maintenance', 'Classroom repainting · Block A', 'v-okon', 'mc', 480000, 'Paid'],
    [
      '2026-09-20',
      'Maintenance',
      'Generator servicing · Block C',
      'v-powergen',
      'mc',
      185000,
      'Paid',
    ],
    ['2026-09-26', 'Catering', 'Refreshments · PTA meeting', null, 'mc', 36500, 'Paid', 'Cash'],
    ['2026-10-09', 'Transport', 'School bus maintenance', null, 'mc', 145000, 'Paid'],
    ['2026-10-14', 'ICT', 'Printer toner · admin office', null, 'mc', 48000, 'Paid', 'Cash'],
    [
      '2026-10-26',
      'Maintenance',
      'Plumbing repairs · girls’ toilets',
      'v-okon',
      'mc',
      96500,
      'Paid',
    ],
    ['2026-10-28', 'Laboratory', 'Science lab reagents', 'v-labtech', 'mc', 212000, 'Paid'],
    [
      '2026-10-30',
      'Laboratory',
      'Science fair supplies',
      'v-labtech',
      'mc',
      64000,
      'Rejected',
      'Bank transfer',
      { rejectReason: 'Already covered by EXP for lab reagents on 28 Oct' },
    ],
    [
      '2026-11-02',
      'Stationery',
      'Exercise books · 2,000 units',
      'v-lekki',
      'mc',
      340000,
      'Approved',
    ],
    [
      '2026-11-03',
      'Stationery',
      'Exam question paper printing',
      'v-lekki',
      'mc',
      132000,
      'Submitted',
    ],
    [
      '2026-11-04',
      'Fuel',
      'Diesel for generators · November',
      'v-ardova',
      'mc',
      640000,
      'Submitted',
    ],
    ['2026-11-05', 'Events', 'Inter-house sports medals', 'v-trophy', 'mc', 78000, 'Draft'],
    [
      '2026-10-12',
      'Events',
      'Lekki open day · canopies and chairs',
      null,
      'lk',
      95000,
      'Paid',
      'Cash',
    ],
  ];
  // Monthly bills at both campuses.
  for (const [month, day] of [
    ['2026-09', '01'],
    ['2026-10', '01'],
    ['2026-11', '01'],
  ] as const) {
    const d = `${month}-${day}`;
    rows.push([
      d,
      'Internet',
      `Internet · ${monthName(month)}`,
      'v-spectranet',
      'mc',
      145000,
      'Paid',
    ]);
    if (month === '2026-11') continue;
    const end = `${month}-${month === '2026-09' ? '30' : '30'}`;
    rows.push([
      `${month}-06`,
      'Fuel',
      `Diesel for generators · ${monthName(month)}`,
      'v-ardova',
      'mc',
      month === '2026-09' ? 615000 : 668000,
      'Paid',
    ]);
    rows.push([
      `${month}-07`,
      'Fuel',
      `Diesel · Lekki · ${monthName(month)}`,
      'v-ardova',
      'lk',
      month === '2026-09' ? 310000 : 295000,
      'Paid',
    ]);
    rows.push([
      `${month}-15`,
      'Utilities',
      `Electricity · ${monthName(month)}`,
      'v-ikeja',
      'mc',
      month === '2026-09' ? 428500 : 451200,
      'Paid',
    ]);
    rows.push([
      `${month}-16`,
      'Utilities',
      `Water · ${monthName(month)}`,
      'v-water',
      'mc',
      62000,
      'Paid',
    ]);
    rows.push([
      end,
      'Security',
      `Security services · ${monthName(month)}`,
      'v-safeguard',
      'mc',
      850000,
      'Paid',
    ]);
    rows.push([
      end,
      'Security',
      `Security services · Lekki · ${monthName(month)}`,
      'v-safeguard',
      'lk',
      420000,
      'Paid',
    ]);
    rows.push([
      end,
      'Cleaning',
      `Cleaning services · ${monthName(month)}`,
      'v-cleanpro',
      'mc',
      380000,
      'Paid',
    ]);
    rows.push([
      end,
      'Cleaning',
      `Cleaning services · Lekki · ${monthName(month)}`,
      'v-cleanpro',
      'lk',
      190000,
      'Paid',
    ]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [
    date,
    category,
    description,
    vendorId,
    branchId,
    amount,
    status,
    method = 'Bank transfer',
    extra,
  ] of rows) {
    if (!branchIds.includes(branchId)) continue;
    const approvals =
      status === 'Draft' || status === 'Submitted' || status === 'Rejected'
        ? []
        : [
            { role: 'Bursar', by: ACTOR, on: addDays(date, 1) },
            ...(amount > fin.settings.expenseLimit
              ? [{ role: 'Principal', by: 'Adaeze Okonkwo', on: addDays(date, 2) }]
              : []),
          ];
    const paidOn =
      status === 'Paid' ? addDays(date, amount > fin.settings.expenseLimit ? 3 : 2) : null;
    const accountId =
      status !== 'Paid'
        ? null
        : method === 'Cash'
          ? branchId === 'lk'
            ? 'acc-cash-lk'
            : 'acc-cash-mc'
          : 'acc-ops';
    const e: ExpenseRec = {
      id: nextId(fin, 'ex'),
      no: status === 'Draft' ? '' : nextNo(fin, 'EXP', date.slice(0, 4)),
      date,
      category,
      description,
      vendorId,
      branchId,
      amount,
      method,
      accountId,
      status,
      approvals,
      submittedBy: status === 'Draft' ? 'Adaeze Okonkwo' : 'Kemi Lawal',
      paidOn: paidOn && paidOn > isoToday() ? isoToday() : paidOn,
      paidRef:
        status === 'Paid'
          ? method === 'Cash'
            ? 'Petty cash voucher'
            : `ACC/OUT/${date.replace(/-/g, '')}/${pad(Math.floor(R(description) * 1000), 3)}`
          : '',
      attachment: vendorId
        ? {
            name: `${vendorId.slice(2)}-invoice-${date.slice(5).replace('-', '')}.pdf`,
            size: `${120 + Math.floor(R(description + 'sz') * 300)} KB`,
          }
        : null,
      rejectReason: '',
      notes: '',
      history: [],
      ...extra,
    };
    e.history = [
      ...(status === 'Draft'
        ? [
            {
              id: 'h1',
              title: 'Saved as draft',
              detail: e.submittedBy,
              when: date,
              tone: 'neutral' as const,
            },
          ]
        : [
            {
              id: 'h1',
              title: 'Submitted for approval',
              detail: e.submittedBy,
              when: date,
              tone: 'info' as const,
            },
          ]),
      ...approvals.map((a, i) => ({
        id: `h${i + 2}`,
        title: `Approved · ${a.role}`,
        detail: a.by,
        when: a.on,
        tone: 'success' as const,
      })),
      ...(status === 'Rejected'
        ? [
            {
              id: 'h9',
              title: 'Rejected',
              detail: `${ACTOR} · ${e.rejectReason}`,
              when: addDays(date, 1),
              tone: 'error' as const,
            },
          ]
        : []),
      ...(e.paidOn
        ? [
            {
              id: 'h8',
              title: 'Paid',
              detail: `${ACTOR} · ${method === 'Cash' ? 'cash' : 'Operations account'}`,
              when: e.paidOn,
              tone: 'success' as const,
            },
          ]
        : []),
    ];
    fin.expenses.push(e);
  }

  // Money moved between accounts: monthly sweeps, cash banked weekly, petty cash top-ups.
  const t = (date: string, fromId: string, toId: string, amount: number, note: string) => {
    if (amount <= 0 || date > isoToday()) return;
    fin.transfers.push({
      id: nextId(fin, 'tr'),
      no: nextNo(fin, 'TRF', date.slice(0, 4)),
      date,
      fromId,
      toId,
      amount,
      reference: '',
      note,
      by: ACTOR,
    });
  };
  t('2026-09-30', 'acc-gtb', 'acc-ops', 40000000, 'Monthly sweep');
  t('2026-09-30', 'acc-zen', 'acc-ops', 15000000, 'Monthly sweep');
  t('2026-10-30', 'acc-gtb', 'acc-ops', 18000000, 'Monthly sweep');
  t('2026-10-30', 'acc-zen', 'acc-ops', 6000000, 'Monthly sweep');
  for (const [cash, bank] of [
    ['acc-cash-mc', 'acc-gtb'],
    ['acc-cash-lk', 'acc-zen'],
  ] as const) {
    for (let d = '2026-08-28'; d <= '2026-11-06'; d = addDays(d, 7)) {
      const from = addDays(d, -7);
      const week = sum(
        fin.payments
          .filter(
            (p) => p.accountId === cash && p.status === 'Confirmed' && p.date > from && p.date <= d,
          )
          .map((p) => p.amount),
      );
      t(d, cash, bank, roundTo(week * 0.9, 1000), 'Cash banked');
    }
  }
  fin.transfers.sort((a, b) => a.date.localeCompare(b.date));
}

const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' });

function seedCrestview(): FinanceData {
  return emptyFinance('crestview');
}

export const financeData: Record<string, FinanceData> = {
  greenfield: seedGreenfield(),
  crestview: seedCrestview(),
};
