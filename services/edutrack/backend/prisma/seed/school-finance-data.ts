/**
 * Finance demo data for Greenfield Academy (Crestview starts empty and sets Finance up itself):
 *
 * - Billing settings (INV / RCT prefixes, Bursar limit ₦250,000, refund limit ₦500,000) and the
 *   suggested fee items: tuition, levies, exams, ICT, admission, and optional textbooks, uniform,
 *   school bus and lunch.
 * - 2026/2027 First Term fee structures published at Main Campus and Lekki Campus, and the
 *   2025/2026 Third Term one at Main Campus.
 * - Discounts (sibling 10% of tuition from the 2nd child, automatic; staff child; scholarship;
 *   custom concession) and two payment plans (pay in full, the default; 60/40 in two parts).
 * - First Term invoices issued on 7 Sep 2026 for every student enrolled in 2026/2027: compulsory
 *   items, the admission fee for this session's new students, the optional items some families
 *   chose (school bus, lunch), Michael Adeyemi's sibling discount and Precious Udoh's scholarship.
 *   Daniel Musa still owes ₦45,000 from 2025/2026 Third Term (balances carry across terms).
 * - Payments: transfers, cash and POS confirmed (Emmanuel Adeyemi and Halima Garba paid in full),
 *   part payments, two parent claims with proof waiting for verification, one rejected claim.
 * - Accounts (GTBank fees account shown to parents, cash office, Zenith operations), a transfer
 *   from the cash office, vendors and expenses (paid, approved, waiting for the Principal, draft).
 *
 * Idempotent: every school's finance rows are cleared first (`clearSchoolFinance`, before the
 * student and academic seeds can remove what they point at), then Greenfield's are written again.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  ExpenseStatus,
  FeeCategory,
  FeeCharged,
  FeeType,
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
} from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

const FINANCE_ENTITIES = [
  'Invoice',
  'Payment',
  'Refund',
  'Expense',
  'Vendor',
  'FeeItem',
  'FeeStructure',
  'Discount',
  'PaymentPlan',
  'BankAccount',
  'AccountTransfer',
  'BankStatement',
  'FinanceSettings',
];

/** Empties the finance tables for every school (run before the other school seeds). */
export async function clearSchoolFinance(prisma: PrismaClient) {
  await prisma.bankStatementLine.deleteMany({});
  await prisma.bankStatement.deleteMany({});
  await prisma.paymentAllocation.deleteMany({});
  await prisma.creditApplication.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceInstallment.deleteMany({});
  await prisma.invoiceDiscount.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.expenseApproval.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.accountTransfer.deleteMany({});
  await prisma.bankAccount.deleteMany({});
  await prisma.feeStructureAmount.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.discount.deleteMany({});
  await prisma.student.updateMany({
    where: { paymentPlanId: { not: null } },
    data: { paymentPlanId: null },
  });
  await prisma.paymentPlanInstallment.deleteMany({});
  await prisma.paymentPlan.deleteMany({});
  await prisma.feeItem.deleteMany({});
  await prisma.term.updateMany({ where: { feesDueOn: { not: null } }, data: { feesDueOn: null } });
  await prisma.auditEvent.deleteMany({
    where: { area: 'Finance', entityType: { in: FINANCE_ENTITIES } },
  });
  await prisma.notification.deleteMany({ where: { category: 'finance' } });
}

type Code = 'NUR' | 'PRI' | 'JSS' | 'SSS';
const ITEMS: [
  key: string,
  name: string,
  category: FeeCategory,
  charged: FeeCharged,
  type: FeeType,
  amounts: Record<Code, number>,
][] = [
  [
    'tuition',
    'Tuition',
    'TUITION',
    'EVERY_TERM',
    'COMPULSORY',
    { NUR: 120000, PRI: 150000, JSS: 220000, SSS: 250000 },
  ],
  [
    'dev',
    'Development levy',
    'LEVY',
    'ONCE_A_SESSION',
    'COMPULSORY',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'exam',
    'Examination fee',
    'EXAMS',
    'EVERY_TERM',
    'COMPULSORY',
    { NUR: 8000, PRI: 15000, JSS: 15000, SSS: 15000 },
  ],
  [
    'ict',
    'ICT fee',
    'ICT',
    'EVERY_TERM',
    'COMPULSORY',
    { NUR: 10000, PRI: 10000, JSS: 10000, SSS: 10000 },
  ],
  [
    'pta',
    'PTA levy',
    'LEVY',
    'ONCE_A_SESSION',
    'COMPULSORY',
    { NUR: 5000, PRI: 5000, JSS: 5000, SSS: 5000 },
  ],
  [
    'admission',
    'Admission fee',
    'ADMISSION',
    'NEW_STUDENTS_ONLY',
    'COMPULSORY',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'books',
    'Textbooks',
    'BOOKS',
    'ONCE_A_SESSION',
    'OPTIONAL',
    { NUR: 20000, PRI: 30000, JSS: 45000, SSS: 45000 },
  ],
  [
    'uniform',
    'Uniform',
    'UNIFORM',
    'NEW_STUDENTS_ONLY',
    'OPTIONAL',
    { NUR: 30000, PRI: 30000, JSS: 30000, SSS: 30000 },
  ],
  [
    'bus',
    'School bus',
    'TRANSPORT',
    'EVERY_TERM',
    'OPTIONAL',
    { NUR: 60000, PRI: 60000, JSS: 60000, SSS: 60000 },
  ],
  [
    'lunch',
    'Lunch',
    'FEEDING',
    'EVERY_TERM',
    'OPTIONAL',
    { NUR: 45000, PRI: 45000, JSS: 45000, SSS: 45000 },
  ],
];

/** Optional items families chose for First Term (admission number → item keys). */
const OPTIONAL: Record<string, string[]> = {
  'STU-2025-0042': ['lunch'],
  'STU-2023-0311': ['bus'],
  'STU-2025-0047': ['bus', 'lunch'],
  'STU-2025-0702': ['lunch'],
};

/** Payments: admission number → [date, method, amount ("full" = the whole balance), status, source]. */
type Pay = [
  date: string,
  method: PaymentMethod,
  amount: number | 'full',
  status: PaymentStatus,
  source: PaymentSource,
  extra?: { reference?: string; proof?: string; reject?: string; payer?: string },
];
const PAYMENTS: Record<string, Pay[]> = {
  'STU-2025-0042': [['2026-09-10', 'BANK_TRANSFER', 'full', 'CONFIRMED', 'SCHOOL']],
  'STU-2023-0311': [['2026-09-10', 'BANK_TRANSFER', 100000, 'CONFIRMED', 'SCHOOL']],
  'STU-2025-0047': [['2026-09-15', 'CASH', 'full', 'CONFIRMED', 'SCHOOL']],
  'STU-2025-0051': [['2026-09-22', 'POS', 150000, 'CONFIRMED', 'SCHOOL']],
  // Clears last term's ₦45,000 first, the rest goes to First Term.
  'STU-2025-0055': [['2026-09-25', 'BANK_TRANSFER', 200000, 'CONFIRMED', 'SCHOOL']],
  'STU-2025-0058': [
    [
      '2026-11-18',
      'BANK_TRANSFER',
      100000,
      'PENDING_VERIFICATION',
      'PARENT_CLAIM',
      { proof: 'gtbank-transfer-receipt.jpg' },
    ],
  ],
  'STU-2025-0063': [
    [
      '2026-11-19',
      'BANK_TRANSFER',
      'full',
      'PENDING_VERIFICATION',
      'PARENT_CLAIM',
      { proof: 'transfer-screenshot.png' },
    ],
  ],
  'STU-2025-0066': [
    [
      '2026-11-12',
      'BANK_TRANSFER',
      50000,
      'REJECTED',
      'PARENT_CLAIM',
      { proof: 'receipt.pdf', reject: 'No matching transfer on the 14 Nov statement' },
    ],
  ],
  'STU-2025-0070': [['2026-09-11', 'BANK_TRANSFER', 'full', 'CONFIRMED', 'SCHOOL']],
  'STU-2023-0412': [['2026-09-08', 'BANK_TRANSFER', 'full', 'CONFIRMED', 'SCHOOL']],
  'STU-2021-0140': [['2026-10-02', 'CASH', 120000, 'CONFIRMED', 'SCHOOL']],
  'STU-2024-0520': [['2026-10-14', 'BANK_TRANSFER', 'full', 'CONFIRMED', 'SCHOOL']],
};

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string, hour = 10) =>
  new Date(`${iso}T${String(hour - 1).padStart(2, '0')}:00:00.000Z`);
const k = (naira: number) => BigInt(Math.round(naira * 100));
const BANKS = ['GTB', 'ACC', 'ZEN', 'UBA', 'FBN'];

export async function seedSchoolFinance(prisma: PrismaClient, schoolIds: Record<string, string>) {
  const schoolId = schoolIds.greenfield;
  if (!schoolId) return;
  const id = (name: string) => demoUuid(`greenfield:finance:${name}`);
  const user = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const kunle = await user('kunle.bakare@greenfield.edu.ng');
  const adaeze = await user('adaeze.okonkwo@greenfield.edu.ng');
  const audit: {
    entityType: string;
    entityId: string;
    action: string;
    summary: string;
    detail?: string;
    tone: string;
    at: Date;
    by: string;
  }[] = [];
  const log = (
    entityType: string,
    entityId: string,
    action: string,
    summary: string,
    when: Date,
    tone = 'info',
    detail?: string,
    by = 'Kunle Bakare',
  ) => audit.push({ entityType, entityId, action, summary, detail, tone, at: when, by });

  /* ---------- Settings ---------- */

  const settings = {
    allowPartial: true,
    autoSibling: true,
    verifyTransfers: true,
    enabledMethods: ['BANK_TRANSFER', 'POS', 'CASH'] as PaymentMethod[],
    invoicePrefix: 'INV',
    receiptPrefix: 'RCT',
    expenseLimitKobo: k(250000),
    refundLimitKobo: k(500000),
    holdReportCards: false,
  };
  await prisma.financeSettings.upsert({
    where: { schoolId },
    create: { schoolId, ...settings },
    update: settings,
  });

  /* ---------- Frame ---------- */

  const branches = await prisma.branch.findMany({ where: { schoolId } });
  const branch = (code: string) => branches.find((b) => b.code === code)!;
  const main = branch('GFA-MC');
  const lekki = branch('GFA-LK');
  const terms = await prisma.term.findMany({
    where: { schoolId },
    include: { session: { select: { name: true } } },
  });
  const term = (session: string, name: string) =>
    terms.find((t) => t.session.name === session && t.name === name)!;
  const first = term('2026/2027', 'First Term');
  const lastTerm = term('2025/2026', 'Third Term');
  await prisma.term.update({ where: { id: first.id }, data: { feesDueOn: day('2026-09-28') } });
  const levels = await prisma.classLevel.findMany({
    where: { schoolId },
    include: { section: { select: { code: true } } },
  });
  const levelBy = (name: string) => levels.find((l) => l.name === name)!;
  const branchLevels = await prisma.branchLevel.findMany({ where: { schoolId } });

  /* ---------- Fee items and structures ---------- */

  const itemId = (key: string) => id(`item:${key}`);
  for (const [key, name, category, charged, type] of ITEMS)
    await prisma.feeItem.create({
      data: {
        id: itemId(key),
        schoolId,
        name,
        category,
        charged,
        type,
        createdAt: at('2026-08-03'),
      },
    });
  const structure = async (termId: string, branchId: string, published: string) => {
    const sid = id(`structure:${termId}:${branchId}`);
    await prisma.feeStructure.create({
      data: {
        id: sid,
        schoolId,
        termId,
        branchId,
        status: 'PUBLISHED',
        publishedAt: at(published),
        publishedById: kunle,
      },
    });
    const amounts = branchLevels
      .filter((bl) => bl.branchId === branchId)
      .flatMap((bl) => {
        const level = levels.find((l) => l.id === bl.levelId)!;
        const code = level.section.code as Code;
        return ITEMS.map(([key, , , , , a]) => ({
          schoolId,
          structureId: sid,
          levelId: level.id,
          feeItemId: itemId(key),
          amountKobo: k(a[code] ?? a.SSS),
        }));
      });
    await prisma.feeStructureAmount.createMany({ data: amounts });
    log('FeeStructure', sid, 'fees.publish', 'Published', at(published), 'success');
  };
  await structure(first.id, main.id, '2026-08-20');
  await structure(first.id, lekki.id, '2026-08-20');
  await structure(lastTerm.id, main.id, '2026-04-10');
  const priceOf = (key: string, levelName: string) => {
    const level = levelBy(levelName);
    const item = ITEMS.find((i) => i[0] === key)!;
    return item[5][level.section.code as Code] ?? item[5].SSS;
  };

  /* ---------- Discounts and plans ---------- */

  const sibling = id('discount:sibling');
  const scholarship = id('discount:scholarship');
  await prisma.discount.createMany({
    data: [
      {
        id: sibling,
        schoolId,
        name: 'Sibling discount',
        basis: 'SIBLING',
        kind: 'PERCENTAGE',
        value: 1000n,
        appliesTo: 'TUITION_ONLY',
        fromChild: 2,
        isAutomatic: true,
        createdAt: at('2026-08-03'),
      },
      {
        id: id('discount:staff'),
        schoolId,
        name: 'Staff child',
        basis: 'STAFF_CHILD',
        kind: 'PERCENTAGE',
        value: 5000n,
        appliesTo: 'TUITION_ONLY',
        needsApproval: true,
        createdAt: at('2026-08-03', 11),
      },
      {
        id: scholarship,
        schoolId,
        name: 'Academic scholarship',
        basis: 'SCHOLARSHIP',
        kind: 'PERCENTAGE',
        value: 5000n,
        appliesTo: 'TUITION_ONLY',
        needsApproval: true,
        createdAt: at('2026-08-03', 12),
      },
      {
        id: id('discount:custom'),
        schoolId,
        name: 'Hardship concession',
        basis: 'CUSTOM',
        kind: 'FIXED_AMOUNT',
        value: k(50000),
        appliesTo: 'ALL_COMPULSORY',
        needsApproval: true,
        createdAt: at('2026-08-03', 13),
      },
    ],
  });
  const fullPlan = id('plan:full');
  await prisma.paymentPlan.create({
    data: {
      id: fullPlan,
      schoolId,
      name: 'Pay in full',
      isDefault: true,
      installments: { create: [{ sequence: 1, shareBp: 10000, offsetDays: 14 }] },
    },
  });
  await prisma.paymentPlan.create({
    data: {
      id: id('plan:two'),
      schoolId,
      name: 'Two installments',
      installments: {
        create: [
          { sequence: 1, shareBp: 6000, offsetDays: 14 },
          { sequence: 2, shareBp: 4000, offsetDays: 42 },
        ],
      },
    },
  });

  /* ---------- Accounts ---------- */

  const fees = id('account:gtbank');
  const cash = id('account:cash');
  const ops = id('account:zenith');
  await prisma.bankAccount.createMany({
    data: [
      {
        id: fees,
        schoolId,
        name: 'Fees collection · GTBank',
        kind: 'BANK',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'Greenfield Academy',
        showToParents: true,
        openingBalanceKobo: k(2_500_000),
        openingOn: day('2026-08-01'),
      },
      {
        id: cash,
        schoolId,
        name: 'Cash office',
        kind: 'CASH',
        branchId: main.id,
        openingBalanceKobo: k(150_000),
        openingOn: day('2026-08-01'),
      },
      {
        id: ops,
        schoolId,
        name: 'Operations · Zenith Bank',
        kind: 'BANK',
        bankName: 'Zenith Bank',
        accountNumber: '1012345678',
        accountName: 'Greenfield Academy Ltd',
        openingBalanceKobo: k(4_000_000),
        openingOn: day('2026-08-01'),
      },
    ],
  });

  /* ---------- Invoices ---------- */

  const enrollments = await prisma.enrollment.findMany({
    where: { schoolId, session: { name: '2026/2027' }, status: 'ACTIVE' },
    include: {
      student: {
        include: { guardians: { include: { guardian: true } } },
      },
      level: true,
    },
    orderBy: [{ student: { admissionNo: 'asc' } }],
  });
  let invoiceSeq = 0;
  const invoices: {
    id: string;
    studentId: string;
    admissionNo: string;
    total: number;
    termStart: string;
  }[] = [];
  const issued = '2026-09-07';
  const payerOf = (s: (typeof enrollments)[number]['student']) =>
    s.guardians.find((g) => g.paysFees) ?? s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
  const tuitionOf = (levelName: string) => priceOf('tuition', levelName);
  for (const e of enrollments) {
    const s = e.student;
    const invId = id(`invoice:${s.admissionNo}:first`);
    const isNew = s.admissionNo.startsWith('STU-2026');
    const keys = [
      'tuition',
      'dev',
      'exam',
      'ict',
      'pta',
      ...(isNew ? ['admission'] : []),
      ...(OPTIONAL[s.admissionNo] ?? []),
    ];
    const lines = keys.map((key) => {
      const item = ITEMS.find((i) => i[0] === key)!;
      return {
        schoolId,
        invoiceId: invId,
        feeItemId: itemId(key),
        label: item[1],
        category: item[2],
        amountKobo: k(priceOf(key, e.level.name)),
        isOptional: item[4] === 'OPTIONAL',
        createdAt: at('2026-09-07', 9),
      };
    });
    const discounts: {
      schoolId: string;
      invoiceId: string;
      discountId: string;
      label: string;
      amountKobo: bigint;
      reason: string;
      appliedById: string | null;
      approvedById: string | null;
      approvedAt: Date | null;
      createdAt: Date;
    }[] = [];
    if (s.admissionNo === 'STU-2023-0311')
      discounts.push({
        schoolId,
        invoiceId: invId,
        discountId: sibling,
        label: 'Sibling discount · 2nd child',
        amountKobo: k(tuitionOf(e.level.name) * 0.1),
        reason: 'Automatic · sibling of Emmanuel Adeyemi',
        appliedById: null,
        approvedById: null,
        approvedAt: null,
        createdAt: at('2026-09-07', 9),
      });
    if (s.admissionNo === 'STU-2025-0088')
      discounts.push({
        schoolId,
        invoiceId: invId,
        discountId: scholarship,
        label: 'Academic scholarship',
        amountKobo: k(tuitionOf(e.level.name) * 0.5),
        reason: 'Top of JSS 1 in 2025/2026',
        appliedById: kunle,
        approvedById: adaeze,
        approvedAt: at('2026-09-08'),
        createdAt: at('2026-09-08'),
      });
    const subtotal = lines.reduce((a, l) => a + l.amountKobo, 0n);
    const discount = discounts.reduce((a, d) => a + d.amountKobo, 0n);
    const payer = payerOf(s);
    await prisma.invoice.create({
      data: {
        id: invId,
        schoolId,
        number: `INV-2026-${String(++invoiceSeq).padStart(4, '0')}`,
        studentId: s.id,
        termId: first.id,
        branchId: e.branchId,
        levelId: e.levelId,
        armId: e.armId,
        status: 'ISSUED',
        subtotalKobo: subtotal,
        discountKobo: discount,
        totalKobo: subtotal - discount,
        issuedOn: day(issued),
        dueOn: day('2026-09-28'),
        paymentPlanId: fullPlan,
        notifiedAt: payer ? at(issued) : null,
        createdById: kunle,
        createdAt: at(issued, 9),
      },
    });
    await prisma.invoiceLine.createMany({ data: lines });
    if (discounts.length) await prisma.invoiceDiscount.createMany({ data: discounts });
    invoices.push({
      id: invId,
      studentId: s.id,
      admissionNo: s.admissionNo,
      total: Number(subtotal - discount) / 100,
      termStart: '2026-09-14',
    });
    log(
      'Invoice',
      invId,
      'invoice.create',
      'Invoice created from the fee structure',
      at(issued, 9),
    );
    log(
      'Invoice',
      invId,
      'invoice.issue',
      payer ? 'Issued and sent to the fee payer' : 'Issued · no guardian to notify',
      at(issued, 10),
      'info',
      payer ? 'Email and SMS' : undefined,
    );
    for (const d of discounts.filter((x) => x.appliedById))
      log(
        'Invoice',
        invId,
        'invoice.discount',
        `${d.label} applied`,
        at('2026-09-08'),
        'success',
        `−₦${(Number(d.amountKobo) / 100).toLocaleString('en-NG')} · approval recorded`,
      );
  }

  // Daniel Musa's unpaid balance from 2025/2026 Third Term (JSS 1 then).
  const daniel = enrollments.find((e) => e.student.admissionNo === 'STU-2025-0055');
  if (daniel) {
    const invId = id('invoice:STU-2025-0055:last-term');
    const lines = [
      ['tuition', 220000],
      ['exam', 15000],
      ['ict', 10000],
    ] as const;
    const subtotal = lines.reduce((a, [, n]) => a + k(n), 0n);
    await prisma.invoice.create({
      data: {
        id: invId,
        schoolId,
        number: 'INV-2025-0412',
        studentId: daniel.studentId,
        termId: lastTerm.id,
        branchId: main.id,
        levelId: levelBy('JSS 1').id,
        status: 'PARTIALLY_PAID',
        subtotalKobo: subtotal,
        totalKobo: subtotal,
        paidKobo: subtotal - k(45000),
        issuedOn: day('2026-04-13'),
        dueOn: day('2026-05-04'),
        paymentPlanId: fullPlan,
        notifiedAt: at('2026-04-13'),
        createdById: kunle,
        createdAt: at('2026-04-13', 9),
      },
    });
    await prisma.invoiceLine.createMany({
      data: lines.map(([key, n]) => ({
        schoolId,
        invoiceId: invId,
        feeItemId: itemId(key),
        label: ITEMS.find((i) => i[0] === key)![1],
        category: ITEMS.find((i) => i[0] === key)![2],
        amountKobo: k(n),
        createdAt: at('2026-04-13', 9),
      })),
    });
    // What was paid last term.
    const payId = id('payment:STU-2025-0055:last-term');
    await prisma.payment.create({
      data: {
        id: payId,
        schoolId,
        number: 'RCT-2026-0001',
        studentId: daniel.studentId,
        paidOn: day('2026-04-20'),
        payerName: 'Alhaji Usman Musa',
        method: 'BANK_TRANSFER',
        reference: 'GTB/NIP/77120044',
        bankAccountId: fees,
        branchId: main.id,
        amountKobo: subtotal - k(45000),
        status: 'CONFIRMED',
        source: 'SCHOOL',
        recordedById: kunle,
        verifiedById: kunle,
        verifiedAt: at('2026-04-21'),
        createdAt: at('2026-04-20'),
        allocations: {
          create: [{ invoiceId: invId, amountKobo: subtotal - k(45000) }],
        },
      },
    });
    invoices.unshift({
      id: invId,
      studentId: daniel.studentId,
      admissionNo: 'STU-2025-0055#last',
      total: Number(subtotal) / 100,
      termStart: '2026-04-20',
    });
    log('Invoice', invId, 'invoice.issue', 'Issued and sent to the fee payer', at('2026-04-13'));
    log(
      'Payment',
      payId,
      'payment.record',
      'Payment recorded',
      at('2026-04-20'),
      'info',
      'Bank transfer · GTB/NIP/77120044',
    );
  }

  /* ---------- Payments ---------- */

  const paid = new Map<string, number>(); // invoice id → naira confirmed
  paid.set(id('invoice:STU-2025-0055:last-term'), daniel ? Number(invoices[0]!.total) - 45000 : 0);
  let receiptSeq = 1;
  for (const e of enrollments) {
    const s = e.student;
    const plans = PAYMENTS[s.admissionNo];
    if (!plans) continue;
    const payer = payerOf(s);
    const payerName = payer
      ? [payer.guardian.title, payer.guardian.fullName].filter(Boolean).join(' ')
      : 'Walk-in payer';
    for (const [i, [date, method, amountSpec, status, source, extra]] of plans.entries()) {
      const open = invoices
        .filter((inv) => inv.studentId === s.id)
        .map((inv) => ({ id: inv.id, balance: inv.total - (paid.get(inv.id) ?? 0) }))
        .filter((x) => x.balance > 0);
      const owed = open.reduce((a, x) => a + x.balance, 0);
      const amount = amountSpec === 'full' ? owed : amountSpec;
      let left = amount;
      const allocations: { invoiceId: string; amount: number }[] = [];
      for (const inv of open) {
        if (left <= 0) break;
        const take = Math.min(left, inv.balance);
        allocations.push({ invoiceId: inv.id, amount: take });
        left -= take;
      }
      if (status === 'CONFIRMED')
        for (const a of allocations) paid.set(a.invoiceId, (paid.get(a.invoiceId) ?? 0) + a.amount);
      const payId = id(`payment:${s.admissionNo}:${i}`);
      const reference =
        method === 'CASH'
          ? ''
          : method === 'POS'
            ? `POS/${s.admissionNo.slice(-4)}/${date.replace(/-/g, '')}`
            : `${BANKS[receiptSeq % BANKS.length]}/NIP/${String(88_000_000 + receiptSeq * 7919).slice(0, 8)}`;
      const claim = source === 'PARENT_CLAIM';
      await prisma.payment.create({
        data: {
          id: payId,
          schoolId,
          number: `RCT-2026-${String(++receiptSeq).padStart(4, '0')}`,
          studentId: s.id,
          paidOn: day(date),
          payerName,
          method,
          reference,
          bankAccountId: method === 'CASH' ? cash : fees,
          branchId: e.branchId,
          amountKobo: k(amount),
          status,
          source,
          recordedById: claim ? null : kunle,
          claimedByGuardianId: claim ? (payer?.guardianId ?? null) : null,
          verifiedById: status === 'CONFIRMED' && method === 'BANK_TRANSFER' ? kunle : null,
          verifiedAt: status === 'CONFIRMED' && method === 'BANK_TRANSFER' ? at(date, 15) : null,
          rejectReason: extra?.reject ?? null,
          proofName: extra?.proof ?? null,
          createdAt: at(date),
          allocations: {
            create: allocations.map((a) => ({ invoiceId: a.invoiceId, amountKobo: k(a.amount) })),
          },
        },
      });
      log(
        'Payment',
        payId,
        claim ? 'payment.claim' : 'payment.record',
        claim ? 'Claimed in the Parent Portal' : 'Payment recorded',
        at(date),
        'info',
        `${method === 'BANK_TRANSFER' ? 'Bank transfer' : method === 'CASH' ? 'Cash' : 'POS'}${reference ? ` · ${reference}` : ''}`,
        claim ? payerName : 'Kunle Bakare',
      );
      if (status === 'CONFIRMED' && method === 'BANK_TRANSFER')
        log(
          'Payment',
          payId,
          'payment.verify',
          'Verified',
          at(date, 15),
          'success',
          'matched on the bank statement',
        );
      if (status === 'REJECTED')
        log(
          'Payment',
          payId,
          'payment.reject',
          'Rejected',
          at('2026-11-14', 11),
          'error',
          `${extra?.reject} · payer notified to resend proof`,
        );
      for (const a of allocations)
        log(
          'Invoice',
          a.invoiceId,
          'invoice.payment',
          `Payment ₦${a.amount.toLocaleString('en-NG')} · ${method === 'BANK_TRANSFER' ? 'bank transfer' : method.toLowerCase()}`,
          at(date, 16),
          status === 'CONFIRMED' ? 'success' : status === 'REJECTED' ? 'error' : 'warning',
          `RCT-2026-${String(receiptSeq).padStart(4, '0')} · ${status === 'CONFIRMED' ? 'confirmed' : status === 'REJECTED' ? 'rejected' : 'pending verification'}`,
        );
    }
  }

  // Stored paid / status, as Finance keeps them.
  for (const inv of invoices) {
    const got = paid.get(inv.id) ?? 0;
    const p = Math.min(got, inv.total);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        paidKobo: k(p),
        status: p >= inv.total ? 'PAID' : p > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
      },
    });
  }

  /* ---------- Transfer ---------- */

  const transferId = id('transfer:1');
  await prisma.accountTransfer.create({
    data: {
      id: transferId,
      schoolId,
      number: 'TRF-2026-0001',
      transferredOn: day('2026-10-01'),
      fromAccountId: cash,
      toAccountId: fees,
      amountKobo: k(100000),
      reference: 'Deposit slip 4471',
      note: 'Cash fees banked',
      createdById: kunle,
      createdAt: at('2026-10-01'),
    },
  });

  /* ---------- Vendors and expenses ---------- */

  const vendors: [string, string, string, string, string, string, string][] = [
    ['ikeja', 'Ikeja Electric', 'Utilities', 'Customer care', '+2347000225543', 'Direct debit', ''],
    [
      'spectranet',
      'Spectranet',
      'Internet',
      'Account manager',
      '+2348090001234',
      'Access Bank',
      '0691234567',
    ],
    [
      'bright',
      'Bright Stationers',
      'Stationery',
      'Mrs. Kemi Bright',
      '+2348034567890',
      'UBA',
      '2034567891',
    ],
    [
      'allen',
      'TotalEnergies Allen',
      'Fuel',
      'Station manager',
      '+2348051112233',
      'First Bank',
      '3012345678',
    ],
    [
      'labcraft',
      'LabCraft Scientific',
      'Laboratory',
      'Mr. Tunde Ojo',
      '+2348023344556',
      'GTBank',
      '0456789123',
    ],
  ];
  for (const [key, name, category, contact, phone, bank, acct] of vendors) {
    const vid = id(`vendor:${key}`);
    await prisma.vendor.create({
      data: {
        id: vid,
        schoolId,
        name,
        category,
        contactName: contact,
        phone,
        bankName: bank,
        accountNumber: acct || null,
        accountName: acct ? name : null,
        createdAt: at('2026-08-05'),
      },
    });
    log('Vendor', vid, 'vendor.create', 'Vendor added', at('2026-08-05'));
  }
  const categoryId = async (name: string) =>
    (
      await prisma.expenseCategory.upsert({
        where: { schoolId_name: { schoolId, name } },
        create: { schoolId, name },
        update: {},
      })
    ).id;
  const expenses: [
    key: string,
    no: string | null,
    date: string,
    category: string,
    description: string,
    vendor: string | null,
    amount: number,
    status: ExpenseStatus,
    approvals: ('BURSAR' | 'PRINCIPAL')[],
    paid?: [string, string, string],
  ][] = [
    [
      'diesel',
      'EXP-2026-0001',
      '2026-10-03',
      'Fuel',
      'Diesel for the generator (1,000 litres)',
      'allen',
      180000,
      'PAID',
      ['BURSAR'],
      [ops, '2026-10-05', 'ZEN/TRF/551920'],
    ],
    [
      'internet',
      'EXP-2026-0002',
      '2026-10-28',
      'Internet',
      'Internet subscription · November',
      'spectranet',
      45000,
      'PAID',
      ['BURSAR'],
      [ops, '2026-10-30', 'ZEN/TRF/553104'],
    ],
    [
      'electric',
      'EXP-2026-0003',
      '2026-11-02',
      'Utilities',
      'Electricity bill · October',
      'ikeja',
      96500,
      'PAID',
      ['BURSAR'],
      [ops, '2026-11-04', 'Direct debit'],
    ],
    [
      'stationery',
      'EXP-2026-0004',
      '2026-11-10',
      'Stationery',
      'First Term examination stationery',
      'bright',
      120000,
      'APPROVED',
      ['BURSAR'],
    ],
    [
      'lab',
      'EXP-2026-0005',
      '2026-11-16',
      'Laboratory',
      'Chemistry and biology reagents for SSS practicals',
      'labcraft',
      320000,
      'SUBMITTED',
      ['BURSAR'],
    ],
    [
      'paint',
      null,
      '2026-11-19',
      'Maintenance',
      'Repainting the JSS classroom block',
      null,
      400000,
      'DRAFT',
      [],
    ],
  ];
  for (const [
    key,
    no,
    date,
    category,
    description,
    vendor,
    amount,
    status,
    approvals,
    paidInfo,
  ] of expenses) {
    const eid = id(`expense:${key}`);
    await prisma.expense.create({
      data: {
        id: eid,
        schoolId,
        number: no ?? `DRAFT-${eid}`,
        spentOn: day(date),
        categoryId: await categoryId(category),
        description,
        vendorId: vendor ? id(`vendor:${vendor}`) : null,
        branchId: main.id,
        amountKobo: k(amount),
        method: 'BANK_TRANSFER',
        status,
        submittedById: kunle,
        submittedAt: status === 'DRAFT' ? null : at(date),
        paidFromAccountId: paidInfo?.[0] ?? null,
        paidAt: paidInfo ? day(paidInfo[1]) : null,
        paidReference: paidInfo?.[2] ?? null,
        attachmentName: amount > 250000 && vendor ? `${key}-invoice.pdf` : null,
        attachmentSize: amount > 250000 && vendor ? '214 KB' : null,
        createdAt: at(date),
        approvals: {
          create: approvals.map((role) => ({
            role,
            approvedById: role === 'BURSAR' ? kunle : adaeze,
            approvedAt: at(date, 14),
          })),
        },
      },
    });
    log('Expense', eid, 'expense.create', 'Saved as draft', at(date), 'neutral');
    if (status !== 'DRAFT')
      log(
        'Expense',
        eid,
        'expense.submit',
        'Submitted for approval',
        at(date, 11),
        'info',
        `needs ${amount > 250000 ? 'Bursar then Principal' : 'Bursar'}`,
      );
    if (approvals.length)
      log(
        'Expense',
        eid,
        'expense.approve',
        'Approved · Bursar',
        at(date, 14),
        'success',
        amount > 250000 ? 'now waiting for the Principal' : undefined,
      );
    if (paidInfo)
      log(
        'Expense',
        eid,
        'expense.pay',
        'Paid',
        at(paidInfo[1]),
        'success',
        `from Operations · Zenith Bank · ${paidInfo[2]}`,
      );
  }

  /* ---------- History ---------- */

  await prisma.auditEvent.createMany({
    data: audit.map((a, i) => ({
      schoolId,
      actorKind: 'USER' as const,
      actorUserId: a.by === 'Kunle Bakare' ? kunle : null,
      actorName: a.by,
      action: a.action,
      area: 'Finance',
      entityType: a.entityType,
      entityId: a.entityId,
      summary: a.summary,
      detail: a.detail ?? null,
      after: { tone: a.tone },
      createdAt: new Date(a.at.getTime() + i),
    })),
  });
}
