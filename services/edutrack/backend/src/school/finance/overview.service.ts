import { Injectable } from '@nestjs/common';
import type {
  Built,
  ReportColumn,
  ReportFilter,
  ReportMetric,
  ReportRow,
} from '../insights/reports-catalog.js';
import { FinanceCore } from './finance-core.service.js';
import type { InvoiceRec, TermRef } from './finance-data.js';
import {
  ALL_METHODS,
  BANKS,
  FEE_CATEGORIES,
  FIN_ROUTE,
  addDays,
  classOf,
  daysBetween,
  finFail,
  millions,
  money,
  notFound,
  plural,
  sum,
  type MethodLabel,
} from './finance-format.js';
import { accountMovements, type InvoiceState } from './finance-ledger.js';
import type { FinanceNotice, FinView } from './finance-view.js';

export type FinanceReportId = 'collection' | 'outstanding' | 'income-expenditure' | 'cash-book';
export type SchoolFinanceReportId = FinanceReportId | 'payments' | 'discounts';

interface Q {
  branch?: string;
  term?: string;
  session?: string;
  from?: string;
  to?: string;
  status?: string;
}

type Tone = 'success' | 'warning' | 'error' | 'neutral';
type Cell = string | number | null;

const REPORTS: Record<FinanceReportId, { title: string; description: string }> = {
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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const shortLabel = (isoDay: string) =>
  `${Number(isoDay.slice(8, 10))} ${MON[Number(isoDay.slice(5, 7)) - 1]}`;
const fmtDate = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const count = (n: number) => n.toLocaleString('en-NG');
const metric = (label: string, value: string, hint?: string, hintTone?: Tone): ReportMetric => ({
  label,
  value,
  ...(hint && { hint }),
  ...(hintTone && { hintTone }),
});
const ALL = 'All';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function monthsBetween(start: string, end: string) {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number) as [number, number];
  for (let ym = start.slice(0, 7); ym <= end.slice(0, 7);) {
    out.push(ym);
    m++;
    if (m > 12) [y, m] = [y + 1, 1];
    ym = `${y}-${String(m).padStart(2, '0')}`;
  }
  return out;
}

/**
 * Finance's overview, its four reports and the screens' options (as the School Admin mock's
 * `finance-overview.ts`), and Finance's part of the dashboard and the school-wide Reports: fee
 * figures, the fee chart, finance attention items and the six Financial reports. Every figure
 * comes from the ledger: only confirmed payments count as collected.
 */
@Injectable()
export class FinanceOverviewService {
  constructor(private readonly core: FinanceCore) {}

  /* ---------------- Figures ---------------- */

  /** Billed / collected / outstanding for one term (and branch), from issued invoices. */
  termFigures(v: FinView, termId: string, branchId: string | null) {
    const invs = v.fin.invoices.filter(
      (i) => i.termId === termId && (!branchId || i.branchId === branchId) && i.status === 'Issued',
    );
    const states = invs.map((inv) => ({ inv, st: v.ledger.invoice(inv.id) }));
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

  private inBranch(v: FinView, branchId: string | null, studentKey: string) {
    return !branchId || v.students.get(studentKey)?.branchId === branchId;
  }

  /** Money in (confirmed payments) and out (paid expenses and refunds) per month. */
  monthly(v: FinView, branchId: string | null, start: string, end: string) {
    return monthsBetween(start, end).map((ym) => ({
      label: MON[Number(ym.slice(5, 7)) - 1]!,
      ym,
      income: sum(
        v.fin.payments
          .filter(
            (p) =>
              p.status === 'Confirmed' &&
              p.date.startsWith(ym) &&
              (!branchId || p.branchId === branchId),
          )
          .map((p) => p.amount),
      ),
      expenditure:
        sum(
          v.fin.expenses
            .filter(
              (e) =>
                e.status === 'Paid' &&
                !!e.paidOn?.startsWith(ym) &&
                (!branchId || e.branchId === branchId),
            )
            .map((e) => e.amount),
        ) +
        sum(
          v.fin.refunds
            .filter(
              (x) =>
                x.status === 'Paid' &&
                !!x.paidOn?.startsWith(ym) &&
                this.inBranch(v, branchId, x.studentKey),
            )
            .map((x) => x.amount),
        ),
    }));
  }

  /** Confirmed collections in each of the last 8 weeks (Mon–Sun), for the dashboard chart. */
  weekly(v: FinView, branchId: string | null) {
    const today = v.today;
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(today, -dow);
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(monday, -7 * (7 - i));
      const to = addDays(from, 6);
      return {
        label: shortLabel(from),
        value: sum(
          v.fin.payments
            .filter(
              (p) =>
                p.status === 'Confirmed' &&
                p.date >= from &&
                p.date <= to &&
                (!branchId || p.branchId === branchId),
            )
            .map((p) => p.amount),
        ),
      };
    });
  }

  /** The term's billing per section, in the school's section order. */
  sectionFigures(v: FinView, termId: string, branchId: string | null) {
    const f = this.termFigures(v, termId, branchId);
    const by = new Map<
      string,
      { rank: number; students: Set<string>; billed: number; collected: number; overdue: number }
    >();
    for (const { inv, st } of f.states) {
      const level = v.fin.levels.find((l) => l.id === inv.levelId);
      const k = level?.section ?? 'Other';
      const row = by.get(k) ?? {
        rank: level?.rank ?? Number.MAX_SAFE_INTEGER,
        students: new Set<string>(),
        billed: 0,
        collected: 0,
        overdue: 0,
      };
      row.rank = Math.min(row.rank, level?.rank ?? Number.MAX_SAFE_INTEGER);
      row.students.add(inv.studentKey);
      row.billed += st.total;
      row.collected += st.paid;
      if (st.overdue) row.overdue += st.balance;
      by.set(k, row);
    }
    return [...by]
      .sort((a, b) => a[1].rank - b[1].rank)
      .map(([section, x]) => ({
        section,
        students: x.students.size,
        billed: x.billed,
        collected: x.collected,
        outstanding: x.billed - x.collected,
        overdue: x.overdue,
        rate: x.billed ? Math.round((x.collected / x.billed) * 100) : 0,
      }));
  }

  /* ---------------- Overview ---------------- */

  async overview(q: Q) {
    const v = await this.core.load();
    const term = v.termOf(q.term, q.session);
    const branchId = v.branchScope(q.branch);
    const f = this.termFigures(v, term.id, branchId);
    const window = { start: addDays(term.start, -30), end: term.end };
    const termExpenses = v.fin.expenses.filter(
      (e) =>
        e.status === 'Paid' &&
        !!e.paidOn &&
        e.paidOn >= window.start &&
        e.paidOn <= window.end &&
        (!branchId || e.branchId === branchId),
    );
    const accounts = v.fin.accounts.filter(
      (a) => a.status === 'Active' && (!branchId || !a.branchId || a.branchId === branchId),
    );
    const pending = v.fin.payments.filter(
      (p) => p.status === 'Pending verification' && (!branchId || p.branchId === branchId),
    );
    const drafts = v.fin.invoices.filter(
      (i) => i.termId === term.id && i.status === 'Draft' && (!branchId || i.branchId === branchId),
    ).length;
    const refunds = v.fin.refunds.filter((x) => x.status === 'Awaiting approval').length;
    const expensesWaiting = v.fin.expenses.filter(
      (e) => e.status === 'Submitted' && (!branchId || e.branchId === branchId),
    );
    const notices: FinanceNotice[] = [];
    if (pending.length)
      notices.push({
        tone: 'warning',
        title: `${plural(pending.length, 'bank transfer')} awaiting verification · ${money(sum(pending.map((p) => p.amount)))}`,
        description:
          'Balances update only after a transfer is verified against the bank statement.',
        action: {
          label: 'Verify now',
          to: { name: FIN_ROUTE.payments, query: { tab: 'pending' } },
        },
      });
    if (f.overdueCount)
      notices.push({
        tone: 'error',
        title: `${plural(f.overdueCount, 'invoice')} overdue · ${millions(f.overdue)}`,
        description:
          'Send reminders with the bank details and transfer reference, or apply late fees.',
        action: {
          label: 'View overdue',
          to: { name: FIN_ROUTE.invoices, query: { status: 'Overdue' } },
        },
      });
    if (drafts)
      notices.push({
        tone: 'info',
        title: `${plural(drafts, 'draft invoice')} not issued`,
        description: 'Parents can’t see drafts until you issue them.',
        action: {
          label: 'Review drafts',
          to: { name: FIN_ROUTE.invoices, query: { status: 'Draft' } },
        },
      });
    if (refunds)
      notices.push({
        tone: 'info',
        title: `${plural(refunds, 'refund')} awaiting approval`,
        description: 'Refunds are paid from credit on the student’s account once approved.',
        action: { label: 'Review', to: { name: FIN_ROUTE.payments, query: { tab: 'refunds' } } },
      });
    if (expensesWaiting.length)
      notices.push({
        tone: 'info',
        title: `${plural(expensesWaiting.length, 'expense')} awaiting approval · ${money(sum(expensesWaiting.map((e) => e.amount)))}`,
        description: 'Bursar approves up to the limit; larger ones also need the Principal.',
        action: {
          label: 'Review',
          to: { name: FIN_ROUTE.expenses, query: { status: 'Submitted' } },
        },
      });
    const range = v.sessionRange();
    const methods = ALL_METHODS.map((method: MethodLabel) => {
      const m = v.fin.payments.filter(
        (p) =>
          p.status === 'Confirmed' &&
          p.method === method &&
          p.date >= window.start &&
          p.date <= window.end &&
          (!branchId || p.branchId === branchId),
      );
      return { method, amount: sum(m.map((p) => p.amount)), count: m.length };
    }).filter((m) => m.count);
    const cats = new Map<string, number>();
    for (const e of termExpenses) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
    const cash = sum(accounts.map((a) => v.ledger.accountBalance(a.id)));
    return {
      term: { id: term.id, name: term.name, session: term.session },
      branch: v.branchName(branchId),
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
      monthly: this.monthly(
        v,
        branchId,
        range.start,
        v.today < range.end ? v.today : range.end,
      ).map(({ label, income, expenditure }) => ({ label, income, expenditure })),
      weekly: this.weekly(v, branchId),
      sections: this.sectionFigures(v, term.id, branchId),
      methods,
      recentPayments: v.fin.payments
        .filter((p) => p.status !== 'Rejected' && (!branchId || p.branchId === branchId))
        .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
        .slice(0, 6)
        .map((p) => v.paymentRow(p)),
      topExpenses: [...cats]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: v.ledger.accountBalance(a.id),
      })),
    };
  }

  /* ---------------- Finance › Reports ---------------- */

  async report(id: string, q: Q) {
    return this.reportFor(await this.core.load(), id, q);
  }

  /** One Finance report; the school-wide Reports show the same figures. */
  reportFor(v: FinView, id: string, q: Q) {
    const meta = REPORTS[id as FinanceReportId];
    if (!meta) throw notFound('Report not found', 'REPORT_NOT_FOUND');
    const rid = id as FinanceReportId;
    const term = v.termOf(q.term, q.session);
    const branchId = v.branchScope(q.branch);
    const filters = `${v.termLabel(term)} · ${v.branchName(branchId)}`;
    const head = { id: rid, ...meta };
    if (rid === 'collection') return { ...head, ...this.collection(v, term, branchId), filters };
    if (rid === 'outstanding') return { ...head, ...this.outstanding(v, branchId) };
    if (rid === 'income-expenditure') return { ...head, ...this.incomeExpenditure(v, branchId) };
    return { ...head, ...this.cashBook(v, term, branchId) };
  }

  private collection(v: FinView, term: TermRef, branchId: string | null) {
    const f = this.termFigures(v, term.id, branchId);
    const by = new Map<
      string,
      {
        cls: string;
        branch: string;
        rank: number;
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
        branch: v.branchName(inv.branchId),
        rank: v.fin.levels.find((l) => l.id === inv.levelId)?.rank ?? 0,
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
        (a, b) => a.branch.localeCompare(b.branch) || a.rank - b.rank || a.cls.localeCompare(b.cls),
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
    const columns: ReportColumn[] = [
      { key: 'class', label: 'Class' },
      ...(branchId ? [] : [{ key: 'branch', label: 'Branch' }]),
      { key: 'students', label: 'Students', align: 'right' },
      { key: 'billed', label: 'Billed', align: 'right', money: true },
      { key: 'collected', label: 'Collected', align: 'right', money: true },
      { key: 'outstanding', label: 'Outstanding', align: 'right', money: true },
      { key: 'overdue', label: 'Overdue', align: 'right', money: true },
      { key: 'rate', label: 'Rate', align: 'right', percent: true },
    ];
    return {
      columns,
      rows: rows as Record<string, Cell>[],
      totals: {
        class: 'Total',
        branch: '',
        students: sum(rows.map((x) => x.students)),
        billed: f.billed,
        collected: f.collected,
        outstanding: f.outstanding,
        overdue: f.overdue,
        rate: f.rate,
      } as Record<string, Cell>,
    };
  }

  private outstanding(v: FinView, branchId: string | null) {
    const today = v.today;
    const by = new Map<string, Record<string, Cell>>();
    for (const inv of v.fin.invoices) {
      if (branchId && inv.branchId !== branchId) continue;
      const st = v.ledger.invoice(inv.id);
      if (st.balance <= 0) continue;
      const s = v.students.get(inv.studentKey);
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
      // Age each unpaid installment by how far past its due date it is.
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
    const keyed = [...by].sort((a, b) => (b[1].total as number) - (a[1].total as number));
    const rows = keyed.map(([, r]) => r);
    const tot = (k: string) => sum(rows.map((x) => x[k] as number));
    const columns: ReportColumn[] = [
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
    ];
    return {
      filters: `All sessions · ${v.branchName(branchId)} · aged at ${fmtDate(today)}`,
      columns,
      rows,
      keys: keyed.map(([k]) => k),
      totals: {
        student: plural(rows.length, 'student'),
        class: '',
        payer: '',
        phone: '',
        current: tot('current'),
        d30: tot('d30'),
        d60: tot('d60'),
        d90: tot('d90'),
        older: tot('older'),
        total: tot('total'),
      } as Record<string, Cell>,
    };
  }

  private incomeExpenditure(v: FinView, branchId: string | null) {
    const range = v.sessionRange();
    const rows = this.monthly(
      v,
      branchId,
      range.start,
      v.today < range.end ? v.today : range.end,
    ).map((m) => ({
      month: `${MONTH_LONG[Number(m.ym.slice(5, 7)) - 1]} ${m.ym.slice(0, 4)}`,
      income: m.income,
      expenditure: m.expenditure,
      net: m.income - m.expenditure,
    }));
    const columns: ReportColumn[] = [
      { key: 'month', label: 'Month' },
      { key: 'income', label: 'Income', align: 'right', money: true },
      { key: 'expenditure', label: 'Expenditure', align: 'right', money: true },
      { key: 'net', label: 'Net', align: 'right', money: true },
    ];
    return {
      filters: `${range.name} · ${v.branchName(branchId)}`,
      columns,
      rows: rows as Record<string, Cell>[],
      totals: {
        month: 'Total',
        income: sum(rows.map((x) => x.income)),
        expenditure: sum(rows.map((x) => x.expenditure)),
        net: sum(rows.map((x) => x.net)),
      } as Record<string, Cell>,
    };
  }

  private cashBook(v: FinView, term: TermRef, branchId: string | null) {
    const from = addDays(term.start, -30);
    const to = v.today < term.end ? v.today : term.end;
    const rows = v.fin.accounts
      .filter((a) => !branchId || !a.branchId || a.branchId === branchId)
      .map((a) => {
        const moves = accountMovements(v.fin, a).filter(
          (m) => m.kind !== 'Opening balance' && m.date >= from && m.date <= to,
        );
        return {
          account: a.name,
          kind: a.kind,
          opening: v.ledger.accountBalance(a.id, addDays(from, -1)),
          moneyIn: sum(moves.map((m) => m.moneyIn)),
          moneyOut: sum(moves.map((m) => m.moneyOut)),
          closing: v.ledger.accountBalance(a.id, to),
        };
      });
    const columns: ReportColumn[] = [
      { key: 'account', label: 'Account' },
      { key: 'kind', label: 'Type' },
      { key: 'opening', label: 'Opening', align: 'right', money: true },
      { key: 'moneyIn', label: 'Money in', align: 'right', money: true },
      { key: 'moneyOut', label: 'Money out', align: 'right', money: true },
      { key: 'closing', label: 'Closing', align: 'right', money: true },
    ];
    return {
      filters: `${fmtDate(from)} – ${fmtDate(to)} · ${v.branchName(branchId)}`,
      columns,
      rows: rows as Record<string, Cell>[],
      totals: {
        account: 'Total',
        kind: '',
        opening: sum(rows.map((x) => x.opening)),
        moneyIn: sum(rows.map((x) => x.moneyIn)),
        moneyOut: sum(rows.map((x) => x.moneyOut)),
        closing: sum(rows.map((x) => x.closing)),
      } as Record<string, Cell>,
    };
  }

  /* ---------------- Options ---------------- */

  async options() {
    const v = await this.core.load();
    const s = v.fin.settings;
    return {
      terms: v.terms.map((t) => ({
        id: t.id,
        name: t.name,
        session: t.session,
        status: t.status,
        start: t.start,
        end: t.end,
      })),
      currentTermId: v.fin.currentTermId,
      branches: v.activeBranches().map((b) => ({ id: b.id, name: b.name })),
      levels: [...new Set(v.fin.levels.map((l) => l.name))],
      accounts: v.fin.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        branchId: a.branchId,
        status: a.status,
      })),
      methods: s.methods,
      allMethods: ALL_METHODS,
      categories: FEE_CATEGORIES,
      expenseCategories: v.fin.expenseCategories,
      vendors: v.fin.vendors
        .filter((x) => x.status === 'Active')
        .map((x) => ({ id: x.id, name: x.name, category: x.category })),
      banks: BANKS,
      settings: {
        allowPartial: s.allowPartial,
        verifyTransfers: s.verifyTransfers,
        expenseLimit: s.expenseLimit,
        refundLimit: s.refundLimit,
      },
    };
  }

  /* ---------------- Dashboard ---------------- */

  /** The current term's fee figures at a branch (id, name or none for all). */
  private feeFigures(v: FinView, branch?: string | null) {
    const term = v.currentTerm();
    if (!term) return null;
    const branchId = v.branchScope(branch);
    const f = this.termFigures(v, term.id, branchId);
    const pending = v.fin.payments.filter(
      (p) => p.status === 'Pending verification' && (!branchId || p.branchId === branchId),
    );
    return { f, pending, branchId, term };
  }

  /** The dashboard's fee card: collections per week and collection rate per section. */
  async dashboardFinance(branch?: string | null) {
    const v = await this.core.load();
    const x = this.feeFigures(v, branch);
    if (!x || !x.f.invoices) return { available: true, note: '', weekly: [], sections: [] };
    return {
      available: true,
      note: '',
      weekly: this.weekly(v, x.branchId),
      sections: this.sectionFigures(v, x.term.id, x.branchId).map((s) => ({
        label: s.section,
        percent: s.rate,
      })),
    };
  }

  /** The dashboard's "Fees collected" and "Outstanding" figures for the current term. */
  async dashboardMetrics(branch?: string | null) {
    const v = await this.core.load();
    const x = this.feeFigures(v, branch);
    const m = (label: string, value: string, hint: string, hintTone: Tone) => ({
      label,
      value,
      hint,
      hintTone,
    });
    if (!x || !x.f.invoices)
      return [
        m('Fees collected', '₦0', 'Nothing billed yet', 'neutral'),
        m('Outstanding', '₦0', 'Nothing billed yet', 'neutral'),
      ];
    const { f } = x;
    return [
      m(
        'Fees collected',
        millions(f.collected),
        `${f.rate}% of ${millions(f.billed)} billed`,
        'neutral',
      ),
      m(
        'Outstanding',
        millions(f.outstanding),
        `${count(f.owingStudents)} students · ${millions(f.overdue)} overdue`,
        f.overdue ? 'error' : 'neutral',
      ),
    ];
  }

  /** Overdue invoices and transfers waiting for verification, for "Needs your attention". */
  async dashboardAttention(branch?: string | null) {
    const v = await this.core.load();
    const x = this.feeFigures(v, branch);
    if (!x) return [];
    const out: {
      id: string;
      badge: { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' | 'info' };
      text: string;
      area: string;
      action: string;
      to: { name: string; query?: Record<string, string> };
    }[] = [];
    if (x.f.overdueCount)
      out.push({
        id: 'overdue-invoices',
        badge: { label: 'Overdue', tone: 'error' },
        text: `${count(x.f.overdueCount)} invoice${x.f.overdueCount === 1 ? ' is' : 's are'} overdue · ${millions(x.f.overdue)}`,
        area: 'Finance · Invoices',
        action: 'View invoices',
        to: { name: FIN_ROUTE.invoices, query: { status: 'Overdue' } },
      });
    if (x.pending.length)
      out.push({
        id: 'verify-transfers',
        badge: { label: 'Verify', tone: 'warning' },
        text: `${x.pending.length} bank transfer${x.pending.length === 1 ? '' : 's'} awaiting verification`,
        area: 'Finance · Payments',
        action: 'Verify',
        to: { name: FIN_ROUTE.payments, query: { tab: 'pending' } },
      });
    return out;
  }

  /* ---------------- School-wide Reports (Financial group) ---------------- */

  private termFilter(v: FinView, term: TermRef): ReportFilter {
    return {
      key: 'term',
      label: 'Term',
      kind: 'select',
      value: term.id,
      options: v.terms.map((t) => ({ value: t.id, label: `${t.session} · ${t.name}` })),
    };
  }

  private validDate(value: string | undefined, label: string) {
    if (!value) return '';
    if (!ISO.test(value) || Number.isNaN(Date.parse(value)))
      throw finFail(`${label} isn’t a valid date.`, 'VALIDATION');
    return value;
  }

  /** Whether the school has terms (Financial reports need a session). */
  async hasTerms() {
    return (await this.core.load()).terms.length > 0;
  }

  /**
   * One Financial report for School Admin › Reports: the four Finance reports as they are there,
   * plus payments by method and account, and discounts and waivers. `branch` is an id or name
   * (null: every branch).
   */
  async schoolReport(id: string, q: Q, branch?: string | null): Promise<Built> {
    const v = await this.core.load();
    const scoped = { ...q, branch: branch ?? undefined };
    if (id === 'payments') return this.paymentsReport(v, scoped);
    if (id === 'discounts') return this.discountsReport(v, scoped);
    return this.fromFinance(v, id as FinanceReportId, scoped);
  }

  private fromFinance(v: FinView, id: FinanceReportId, q: Q): Built {
    const term = v.termOf(q.term, q.session);
    const rep = this.reportFor(v, id, { branch: q.branch, term: term.id });
    const keys = 'keys' in rep ? (rep.keys as string[]) : null;
    const rows: ReportRow[] = rep.rows.map((r, i) => ({
      cells: r,
      ...(keys?.[i] && { to: { name: FIN_ROUTE.studentAccount, params: { key: keys[i] } } }),
    }));
    const t = rep.totals ?? {};
    const n = (k: string) => (typeof t[k] === 'number' ? t[k] : 0);
    const metrics: ReportMetric[] =
      id === 'collection'
        ? [
            metric('Billed', money(n('billed'))),
            metric('Collected', money(n('collected')), `${n('rate')}% of billing`, 'success'),
            metric('Outstanding', money(n('outstanding'))),
            metric('Overdue', money(n('overdue')), undefined, n('overdue') ? 'warning' : undefined),
          ]
        : id === 'outstanding'
          ? [
              metric('Owed in total', money(n('total'))),
              metric('Students owing', count(rep.rows.length)),
              metric('Not yet due', money(n('current'))),
              metric(
                'Over 90 days late',
                money(n('older')),
                undefined,
                n('older') ? 'error' : undefined,
              ),
            ]
          : id === 'income-expenditure'
            ? [
                metric('Income', money(n('income'))),
                metric('Expenditure', money(n('expenditure'))),
                metric(
                  'Net',
                  money(n('net')),
                  n('net') < 0 ? 'More spent than received' : undefined,
                  n('net') < 0 ? 'error' : undefined,
                ),
              ]
            : [
                metric('Opening', money(n('opening'))),
                metric('Money in', money(n('moneyIn'))),
                metric('Money out', money(n('moneyOut'))),
                metric('Closing', money(n('closing'))),
              ];
    const usesTerm = id === 'collection' || id === 'cash-book';
    return {
      scope: rep.filters,
      filters: usesTerm ? [this.termFilter(v, term)] : [],
      metrics,
      columns: rep.columns,
      rows,
      totals: rep.totals,
      note: 'Same figures as Finance → Reports. Only confirmed payments count as collected.',
      emptyText: 'Nothing to report for these filters.',
    };
  }

  private paymentsReport(v: FinView, q: Q): Built {
    const term = v.termOf(q.term, q.session);
    const branchId = v.branchScope(q.branch);
    const from = this.validDate(q.from, 'From') || term.start;
    const to = this.validDate(q.to, 'To') || (v.today < term.end ? v.today : term.end);
    if (from > to) throw finFail('The start date is after the end date.', 'VALIDATION');
    const STATUSES = ['Confirmed', 'Pending verification', 'Rejected'];
    const status = STATUSES.includes(q.status ?? '') || q.status === ALL ? q.status! : 'Confirmed';
    const inScope = v.fin.payments.filter(
      (p) => p.date >= from && p.date <= to && (!branchId || p.branchId === branchId),
    );
    const chosen = inScope.filter((p) => status === ALL || p.status === status);
    const total = sum(chosen.map((p) => p.amount));
    const by = new Map<
      string,
      { method: string; account: string; count: number; amount: number }
    >();
    for (const p of chosen) {
      const account = v.fin.accounts.find((a) => a.id === p.accountId)?.name ?? 'Removed account';
      const k = `${p.method}|${account}`;
      const row = by.get(k) ?? { method: p.method, account, count: 0, amount: 0 };
      row.count++;
      row.amount += p.amount;
      by.set(k, row);
    }
    const rows: ReportRow[] = [...by.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((x) => ({
        cells: {
          method: x.method,
          account: x.account,
          count: x.count,
          amount: x.amount,
          share: pct(x.amount, total),
        },
      }));
    const pending = inScope.filter((p) => p.status === 'Pending verification');
    return {
      scope: `${fmtDate(from)} – ${fmtDate(to)} · ${v.branchName(branchId)} · ${status === ALL ? 'All statuses' : status}`,
      filters: [
        {
          key: 'status',
          label: 'Status',
          kind: 'select',
          value: status,
          options: [
            { value: ALL, label: 'All statuses' },
            ...STATUSES.map((o) => ({ value: o, label: o })),
          ],
        },
        { key: 'from', label: 'From', kind: 'date', value: from },
        { key: 'to', label: 'To', kind: 'date', value: to },
      ],
      metrics: [
        metric(status === ALL ? 'Total' : status, money(total), plural(chosen.length, 'payment')),
        metric('Average payment', money(chosen.length ? total / chosen.length : 0)),
        metric(
          'Pending verification',
          money(sum(pending.map((p) => p.amount))),
          plural(pending.length, 'transfer'),
          pending.length ? 'warning' : undefined,
        ),
      ],
      columns: [
        { key: 'method', label: 'Method' },
        { key: 'account', label: 'Paid into' },
        { key: 'count', label: 'Payments', align: 'right' },
        { key: 'amount', label: 'Amount', align: 'right', money: true },
        { key: 'share', label: 'Share', align: 'right', percent: true },
      ],
      rows,
      totals: rows.length
        ? { method: 'Total', account: '', count: chosen.length, amount: total, share: 100 }
        : null,
      note: 'Pending transfers only count once they are verified against the bank statement.',
      emptyText: 'No payments in this period.',
    };
  }

  private discountsReport(v: FinView, q: Q): Built {
    const term = v.termOf(q.term, q.session);
    const branchId = v.branchScope(q.branch);
    const invs: InvoiceRec[] = v.fin.invoices.filter(
      (i) =>
        i.termId === term.id && i.status === 'Issued' && (!branchId || i.branchId === branchId),
    );
    const gross = sum(invs.flatMap((i) => i.lines.map((l) => l.amount)));
    const by = new Map<
      string,
      { label: string; students: Set<string>; times: number; amount: number }
    >();
    for (const inv of invs)
      for (const d of inv.discounts) {
        const k = d.discountId ?? `manual:${d.label}`;
        const label =
          (d.discountId && v.fin.discounts.find((x) => x.id === d.discountId)?.name) || d.label;
        const row = by.get(k) ?? { label, students: new Set<string>(), times: 0, amount: 0 };
        row.students.add(inv.studentKey);
        row.times++;
        row.amount += d.amount;
        by.set(k, row);
      }
    const total = sum([...by.values()].map((x) => x.amount));
    const students = new Set(invs.filter((i) => i.discounts.length).map((i) => i.studentKey)).size;
    const list = [...by.values()].sort((a, b) => b.amount - a.amount);
    const rows: ReportRow[] = list.map((x) => ({
      cells: {
        discount: x.label,
        students: x.students.size,
        times: x.times,
        amount: x.amount,
        share: pct(x.amount, gross),
      },
    }));
    return {
      scope: `${term.session} · ${term.name} · ${v.branchName(branchId)}`,
      filters: [this.termFilter(v, term)],
      metrics: [
        metric('Discounts given', money(total)),
        metric(
          'Students with a discount',
          count(students),
          `of ${count(new Set(invs.map((i) => i.studentKey)).size)} billed`,
        ),
        metric(
          'Share of gross billing',
          `${pct(total, gross)}%`,
          `${money(gross)} before discounts`,
        ),
      ],
      columns: [
        { key: 'discount', label: 'Discount' },
        { key: 'students', label: 'Students', align: 'right' },
        { key: 'times', label: 'Times applied', align: 'right' },
        { key: 'amount', label: 'Amount', align: 'right', money: true },
        { key: 'share', label: '% of billing', align: 'right', percent: true },
      ],
      rows,
      totals: rows.length
        ? {
            discount: 'Total',
            students,
            times: sum(list.map((x) => x.times)),
            amount: total,
            share: pct(total, gross),
          }
        : null,
      note: 'Issued invoices only. Drafts and cancelled invoices are left out.',
      emptyText: 'No discounts on this term’s invoices.',
    };
  }
}

export type { InvoiceState };
