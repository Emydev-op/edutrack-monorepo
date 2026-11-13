import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  FinanceNotice,
  FinanceOptions,
  FinanceOverview,
  PaymentMethod,
  ReportId,
  ReportView,
} from '@/types';

import { ALL_METHODS, BANKS, FEE_CATEGORIES, levelSection, type FinanceData } from '../finance-db';
import {
  accountMovements,
  addDays,
  daysBetween,
  isoToday,
  levelRank,
  sum,
  type Ledger,
} from '../finance-ledger';
import { fmtDate, plural } from './academics-shared';
import {
  branchNameOf,
  branchScope,
  classOf,
  finFor,
  millions,
  naira,
  paymentRow,
  sessionRange,
  termLabel,
  termOf,
  type FinCtx,
} from './finance-shared';

const r = routesPath.finance;
const SECTION_NAMES: Record<string, string> = {
  NUR: 'Nursery',
  PRI: 'Primary',
  JSS: 'Junior Secondary',
  SSS: 'Senior Secondary',
};

/** Billed / collected / outstanding for one term (and branch), from issued invoices. */
export function termFigures(
  fin: FinanceData,
  ledger: Ledger,
  termId: string,
  branchId: string | null,
) {
  const invs = fin.invoices.filter(
    (i) => i.termId === termId && (!branchId || i.branchId === branchId) && i.status === 'Issued',
  );
  const states = invs.map((i) => ({ inv: i, st: ledger.invoice(i.id) }));
  const billed = sum(states.map((x) => x.st.total));
  const collected = sum(states.map((x) => x.st.paid));
  const owing = states.filter((x) => x.st.balance > 0);
  return {
    invoices: invs.length,
    billed,
    collected,
    outstanding: billed - collected,
    owingStudents: new Set(owing.map((x) => x.inv.studentKey)).size,
    overdue: sum(owing.filter((x) => x.st.overdue).map((x) => x.st.balance)),
    overdueCount: owing.filter((x) => x.st.overdue).length,
    rate: billed ? Math.round((collected / billed) * 100) : 0,
    states,
  };
}

const monthsBetween = (start: string, end: string) => {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number) as [number, number];
  for (let ym = start.slice(0, 7); ym <= end.slice(0, 7);) {
    out.push(ym);
    m++;
    if (m > 12) [y, m] = [y + 1, 1];
    ym = `${y}-${String(m).padStart(2, '0')}`;
  }
  return out;
};
const monthLabel = (ym: string) =>
  new Date(`${ym}-15T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });

/** Money in (confirmed payments) and out (paid expenses and refunds) per month. */
export function monthly(ctx: FinCtx, branchId: string | null, start: string, end: string) {
  const inBranch = (key: string) => !branchId || ctx.students.get(key)?.branchId === branchId;
  return monthsBetween(start, end).map((ym) => ({
    label: monthLabel(ym),
    ym,
    income: sum(
      ctx.fin.payments
        .filter((p) => p.status === 'Confirmed' && p.date.startsWith(ym) && inBranch(p.studentKey))
        .map((p) => p.amount),
    ),
    expenditure:
      sum(
        ctx.fin.expenses
          .filter(
            (e) =>
              e.status === 'Paid' &&
              e.paidOn?.startsWith(ym) &&
              (!branchId || e.branchId === branchId),
          )
          .map((e) => e.amount),
      ) +
      sum(
        ctx.fin.refunds
          .filter((x) => x.status === 'Paid' && x.paidOn?.startsWith(ym) && inBranch(x.studentKey))
          .map((x) => x.amount),
      ),
  }));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortLabel = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;

/** Confirmed collections in each of the last 8 weeks (Mon–Sun), for the dashboard chart. */
export function weekly(
  fin: FinanceData,
  branchId: string | null,
  students: Map<string, { branchId: string }>,
) {
  const today = isoToday();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return Array.from({ length: 8 }, (_, i) => {
    const from = addDays(monday, -7 * (7 - i));
    const to = addDays(from, 6);
    return {
      label: shortLabel(from),
      value: sum(
        fin.payments
          .filter(
            (p) =>
              p.status === 'Confirmed' &&
              p.date >= from &&
              p.date <= to &&
              (!branchId || students.get(p.studentKey)?.branchId === branchId),
          )
          .map((p) => p.amount),
      ),
    };
  });
}

export function sectionFigures(
  fin: FinanceData,
  ledger: Ledger,
  termId: string,
  branchId: string | null,
) {
  const f = termFigures(fin, ledger, termId, branchId);
  const by = new Map<
    string,
    { students: Set<string>; billed: number; collected: number; overdue: number }
  >();
  for (const { inv, st } of f.states) {
    const k = levelSection(inv.level);
    const row = by.get(k) ?? { students: new Set(), billed: 0, collected: 0, overdue: 0 };
    row.students.add(inv.studentKey);
    row.billed += st.total;
    row.collected += st.paid;
    if (st.overdue) row.overdue += st.balance;
    by.set(k, row);
  }
  return ['NUR', 'PRI', 'JSS', 'SSS']
    .filter((k) => by.has(k))
    .map((k) => {
      const x = by.get(k)!;
      return {
        section: SECTION_NAMES[k]!,
        students: x.students.size,
        billed: x.billed,
        collected: x.collected,
        outstanding: x.billed - x.collected,
        overdue: x.overdue,
        rate: x.billed ? Math.round((x.collected / x.billed) * 100) : 0,
      };
    });
}

mock.get('/v1/finance/overview', (req): FinanceOverview => {
  const ctx = finFor(req);
  const term = termOf(ctx, req.query.term, req.query.session);
  const branchId = branchScope(ctx, req.query.branch);
  const f = termFigures(ctx.fin, ctx.ledger, term.id, branchId);
  const window = { start: addDays(term.start, -30), end: term.end };
  const termExpenses = ctx.fin.expenses.filter(
    (e) =>
      e.status === 'Paid' &&
      e.paidOn &&
      e.paidOn >= window.start &&
      e.paidOn <= window.end &&
      (!branchId || e.branchId === branchId),
  );
  const accounts = ctx.fin.accounts.filter(
    (a) => a.status === 'Active' && (!branchId || !a.branchId || a.branchId === branchId),
  );
  const pending = ctx.fin.payments.filter(
    (p) =>
      p.status === 'Pending verification' &&
      (!branchId || ctx.students.get(p.studentKey)?.branchId === branchId),
  );
  const drafts = ctx.fin.invoices.filter(
    (i) => i.termId === term.id && i.status === 'Draft' && (!branchId || i.branchId === branchId),
  ).length;
  const refunds = ctx.fin.refunds.filter((x) => x.status === 'Awaiting approval').length;
  const expensesWaiting = ctx.fin.expenses.filter(
    (e) => e.status === 'Submitted' && (!branchId || e.branchId === branchId),
  );
  const notices: FinanceNotice[] = [];
  if (pending.length)
    notices.push({
      tone: 'warning',
      title: `${plural(pending.length, 'bank transfer')} awaiting verification · ${naira(sum(pending.map((p) => p.amount)))}`,
      description: 'Balances update only after a transfer is verified against the bank statement.',
      action: { label: 'Verify now', to: { name: r.payments.name, query: { tab: 'pending' } } },
    });
  if (f.overdueCount)
    notices.push({
      tone: 'error',
      title: `${plural(f.overdueCount, 'invoice')} overdue · ${millions(f.overdue)}`,
      description:
        'Send reminders with the bank details and transfer reference, or apply late fees.',
      action: {
        label: 'View overdue',
        to: { name: r.invoices.name, query: { status: 'Overdue' } },
      },
    });
  if (drafts)
    notices.push({
      tone: 'info',
      title: `${plural(drafts, 'draft invoice')} not issued`,
      description: 'Parents can’t see drafts until you issue them.',
      action: { label: 'Review drafts', to: { name: r.invoices.name, query: { status: 'Draft' } } },
    });
  if (refunds)
    notices.push({
      tone: 'info',
      title: `${plural(refunds, 'refund')} awaiting approval`,
      description: 'Refunds are paid from credit on the student’s account once approved.',
      action: { label: 'Review', to: { name: r.payments.name, query: { tab: 'refunds' } } },
    });
  if (expensesWaiting.length)
    notices.push({
      tone: 'info',
      title: `${plural(expensesWaiting.length, 'expense')} awaiting approval · ${naira(sum(expensesWaiting.map((e) => e.amount)))}`,
      description: 'Bursar approves up to the limit; larger ones also need the Principal.',
      action: { label: 'Review', to: { name: r.expenses.name, query: { status: 'Submitted' } } },
    });
  const range = sessionRange(ctx);
  const methods = ALL_METHODS.map((method: PaymentMethod) => {
    const m = ctx.fin.payments.filter(
      (p) =>
        p.status === 'Confirmed' &&
        p.method === method &&
        p.date >= window.start &&
        p.date <= window.end &&
        (!branchId || ctx.students.get(p.studentKey)?.branchId === branchId),
    );
    return { method, amount: sum(m.map((p) => p.amount)), count: m.length };
  }).filter((m) => m.count);
  const cats = new Map<string, number>();
  for (const e of termExpenses) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
  const cash = sum(accounts.map((a) => ctx.ledger.accountBalance(a.id)));
  return {
    term: { id: term.id, name: term.name, session: term.session },
    branch: branchNameOf(ctx, branchId),
    kpis: [
      { label: 'Billed', value: millions(f.billed), hint: plural(f.invoices, 'invoice') },
      {
        label: 'Collected',
        value: millions(f.collected),
        hint: `${f.rate}% collection`,
        tone: f.rate >= 70 ? 'success' : 'warning',
      },
      {
        label: 'Outstanding',
        value: millions(f.outstanding),
        hint: plural(f.owingStudents, 'student'),
      },
      {
        label: 'Overdue',
        value: millions(f.overdue),
        hint: plural(f.overdueCount, 'invoice'),
        tone: f.overdueCount ? 'error' : 'neutral',
      },
      {
        label: 'Expenses',
        value: millions(sum(termExpenses.map((e) => e.amount))),
        hint: `${term.name} to date`,
      },
      {
        label: 'Cash & bank',
        value: millions(cash),
        hint: pending.length
          ? `${millions(sum(pending.map((p) => p.amount)))} pending`
          : plural(accounts.length, 'account'),
      },
    ],
    notices,
    monthly: monthly(
      ctx,
      branchId,
      range.start,
      isoToday() < range.end ? isoToday() : range.end,
    ).map(({ label, income, expenditure }) => ({ label, income, expenditure })),
    weekly: weekly(ctx.fin, branchId, ctx.students),
    sections: sectionFigures(ctx.fin, ctx.ledger, term.id, branchId),
    methods,
    recentPayments: ctx.fin.payments
      .filter(
        (p) =>
          p.status !== 'Rejected' &&
          (!branchId || ctx.students.get(p.studentKey)?.branchId === branchId),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
      .slice(0, 6)
      .map((p) => paymentRow(ctx, p)),
    topExpenses: [...cats]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: ctx.ledger.accountBalance(a.id),
    })),
  };
});

/* ---------------- Reports ---------------- */

const REPORTS: Record<ReportId, { title: string; description: string }> = {
  collection: {
    title: 'Fee collection by class',
    description: 'How much of the term’s billing has been collected, per class.',
  },
  outstanding: {
    title: 'Outstanding balances',
    description: 'Students who owe, including earlier sessions, by how long it has been overdue.',
  },
  'income-expenditure': {
    title: 'Income vs expenditure',
    description: 'Money received and spent each month this session.',
  },
  'cash-book': {
    title: 'Cash book',
    description:
      'Opening balance, money in, money out and closing balance per account for the term.',
  },
};

mock.get('/v1/finance/reports/:id', (req): ReportView => {
  const ctx = finFor(req);
  const id = req.params.id as ReportId;
  const meta = REPORTS[id];
  if (!meta) throw new MockHttpError(404, 'Report not found');
  const term = termOf(ctx, req.query.term, req.query.session);
  const branchId = branchScope(ctx, req.query.branch);
  const filters = `${termLabel(term)} · ${branchNameOf(ctx, branchId)}`;
  if (id === 'collection') {
    const f = termFigures(ctx.fin, ctx.ledger, term.id, branchId);
    const by = new Map<
      string,
      {
        cls: string;
        branch: string;
        level: string;
        students: number;
        billed: number;
        collected: number;
        overdue: number;
      }
    >();
    for (const { inv, st } of f.states) {
      const k = `${inv.branchId}|${classOf(inv)}`;
      const row = by.get(k) ?? {
        cls: classOf(inv),
        branch: branchNameOf(ctx, inv.branchId),
        level: inv.level,
        students: 0,
        billed: 0,
        collected: 0,
        overdue: 0,
      };
      row.students++;
      row.billed += st.total;
      row.collected += st.paid;
      if (st.overdue) row.overdue += st.balance;
      by.set(k, row);
    }
    const rows = [...by.values()]
      .sort(
        (a, b) =>
          a.branch.localeCompare(b.branch) ||
          levelRank(a.level) - levelRank(b.level) ||
          a.cls.localeCompare(b.cls),
      )
      .map((x) => ({
        class: x.cls,
        branch: x.branch,
        students: x.students,
        billed: x.billed,
        collected: x.collected,
        outstanding: x.billed - x.collected,
        overdue: x.overdue,
        rate: x.billed ? Math.round((x.collected / x.billed) * 100) : 0,
      }));
    return {
      id,
      ...meta,
      filters,
      columns: [
        { key: 'class', label: 'Class' },
        ...(branchId ? [] : [{ key: 'branch', label: 'Branch' }]),
        { key: 'students', label: 'Students', align: 'right' as const },
        { key: 'billed', label: 'Billed', align: 'right' as const, money: true },
        { key: 'collected', label: 'Collected', align: 'right' as const, money: true },
        { key: 'outstanding', label: 'Outstanding', align: 'right' as const, money: true },
        { key: 'overdue', label: 'Overdue', align: 'right' as const, money: true },
        { key: 'rate', label: 'Rate', align: 'right' as const, percent: true },
      ],
      rows,
      totals: {
        class: 'Total',
        branch: '',
        students: sum(rows.map((x) => x.students)),
        billed: f.billed,
        collected: f.collected,
        outstanding: f.outstanding,
        overdue: f.overdue,
        rate: f.rate,
      },
    };
  }
  if (id === 'outstanding') {
    const today = isoToday();
    const by = new Map<string, Record<string, number | string>>();
    for (const inv of ctx.fin.invoices) {
      if (branchId && inv.branchId !== branchId) continue;
      const st = ctx.ledger.invoice(inv.id);
      if (st.balance <= 0) continue;
      const s = ctx.students.get(inv.studentKey);
      const row = by.get(inv.studentKey) ?? {
        student: s?.name ?? '',
        admissionNo: s?.admissionNo ?? '',
        class: s ? classOf(s) : '',
        payer: s?.payer ?? 'No guardian linked',
        phone: s?.payerPhone ?? '',
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        older: 0,
        total: 0,
      };
      // Age each installment that is unpaid by how far past its due date it is.
      for (const ins of st.installments) {
        const owed = ins.amount - ins.paid;
        if (owed <= 0) continue;
        const late = daysBetween(ins.due, today);
        const bucket =
          late <= 0
            ? 'current'
            : late <= 30
              ? 'd30'
              : late <= 60
                ? 'd60'
                : late <= 90
                  ? 'd90'
                  : 'older';
        row[bucket] = (row[bucket] as number) + owed;
        row.total = (row.total as number) + owed;
      }
      by.set(inv.studentKey, row);
    }
    const rows = [...by.values()].sort((a, b) => (b.total as number) - (a.total as number));
    const tot = (k: string) => sum(rows.map((x) => x[k] as number));
    return {
      id,
      ...meta,
      filters: `All sessions · ${branchNameOf(ctx, branchId)} · aged at ${fmtDate(today)}`,
      columns: [
        { key: 'student', label: 'Student' },
        { key: 'class', label: 'Class' },
        { key: 'payer', label: 'Fee payer' },
        { key: 'phone', label: 'Phone' },
        { key: 'current', label: 'Not yet due', align: 'right', money: true },
        { key: 'd30', label: '1–30 days', align: 'right', money: true },
        { key: 'd60', label: '31–60', align: 'right', money: true },
        { key: 'd90', label: '61–90', align: 'right', money: true },
        { key: 'older', label: '90+', align: 'right', money: true },
        { key: 'total', label: 'Total', align: 'right', money: true },
      ],
      rows,
      totals: {
        student: `${plural(rows.length, 'student')}`,
        class: '',
        payer: '',
        phone: '',
        current: tot('current'),
        d30: tot('d30'),
        d60: tot('d60'),
        d90: tot('d90'),
        older: tot('older'),
        total: tot('total'),
      },
    };
  }
  if (id === 'income-expenditure') {
    const range = sessionRange(ctx);
    const rows = monthly(
      ctx,
      branchId,
      range.start,
      isoToday() < range.end ? isoToday() : range.end,
    ).map((m) => ({
      month: new Date(`${m.ym}-15T00:00:00`).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      }),
      income: m.income,
      expenditure: m.expenditure,
      net: m.income - m.expenditure,
    }));
    return {
      id,
      ...meta,
      filters: `${range.name} · ${branchNameOf(ctx, branchId)}`,
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'income', label: 'Income', align: 'right', money: true },
        { key: 'expenditure', label: 'Expenditure', align: 'right', money: true },
        { key: 'net', label: 'Net', align: 'right', money: true },
      ],
      rows,
      totals: {
        month: 'Total',
        income: sum(rows.map((x) => x.income)),
        expenditure: sum(rows.map((x) => x.expenditure)),
        net: sum(rows.map((x) => x.net)),
      },
    };
  }
  const from = addDays(term.start, -30);
  const to = isoToday() < term.end ? isoToday() : term.end;
  const rows = ctx.fin.accounts
    .filter((a) => !branchId || !a.branchId || a.branchId === branchId)
    .map((a) => {
      const opening = ctx.ledger.accountBalance(a.id, addDays(from, -1));
      const closing = ctx.ledger.accountBalance(a.id, to);
      const moves = accountMovesBetween(ctx, a.id, from, to);
      return {
        account: a.name,
        kind: a.kind,
        opening,
        moneyIn: moves.in,
        moneyOut: moves.out,
        closing,
      };
    });
  return {
    id,
    ...meta,
    filters: `${fmtDate(from)} – ${fmtDate(to)} · ${branchNameOf(ctx, branchId)}`,
    columns: [
      { key: 'account', label: 'Account' },
      { key: 'kind', label: 'Type' },
      { key: 'opening', label: 'Opening', align: 'right', money: true },
      { key: 'moneyIn', label: 'Money in', align: 'right', money: true },
      { key: 'moneyOut', label: 'Money out', align: 'right', money: true },
      { key: 'closing', label: 'Closing', align: 'right', money: true },
    ],
    rows,
    totals: {
      account: 'Total',
      kind: '',
      opening: sum(rows.map((x) => x.opening)),
      moneyIn: sum(rows.map((x) => x.moneyIn)),
      moneyOut: sum(rows.map((x) => x.moneyOut)),
      closing: sum(rows.map((x) => x.closing)),
    },
  };
});

function accountMovesBetween(ctx: FinCtx, accountId: string, from: string, to: string) {
  const acc = ctx.fin.accounts.find((a) => a.id === accountId)!;
  const moves = accountMovements(ctx.fin, acc).filter(
    (m) => m.kind !== 'Opening balance' && m.date >= from && m.date <= to,
  );
  return { in: sum(moves.map((m) => m.moneyIn)), out: sum(moves.map((m) => m.moneyOut)) };
}

/* ---------------- Options ---------------- */

mock.get('/v1/finance/options', (req): FinanceOptions => {
  const ctx = finFor(req);
  const cur = ctx.terms.length ? termOf(ctx) : null;
  return {
    terms: ctx.terms.map((t) => ({
      id: t.id,
      name: t.name,
      session: t.session,
      status: ctx.acad.sessions.flatMap((s) => s.terms).find((x) => x.id === t.id)?.status ?? '',
      start: t.start,
      end: t.end,
    })),
    currentTermId: cur?.id ?? null,
    branches: ctx.data.branches
      .filter((b) => b.status === 'Active')
      .map((b) => ({ id: b.id, name: b.name })),
    levels: [...new Set(ctx.acad.levels.map((l) => l.name))].sort(
      (a, b) => levelRank(a) - levelRank(b),
    ),
    accounts: ctx.fin.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      branchId: a.branchId,
      status: a.status,
    })),
    methods: ctx.fin.settings.methods,
    allMethods: ALL_METHODS,
    categories: FEE_CATEGORIES,
    expenseCategories: ctx.fin.expenseCategories,
    vendors: ctx.fin.vendors
      .filter((v) => v.status === 'Active')
      .map((v) => ({ id: v.id, name: v.name, category: v.category })),
    banks: BANKS,
    settings: {
      allowPartial: ctx.fin.settings.allowPartial,
      verifyTransfers: ctx.fin.settings.verifyTransfers,
      expenseLimit: ctx.fin.settings.expenseLimit,
      refundLimit: ctx.fin.settings.refundLimit,
    },
  };
});
