/**
 * Reports: one place for the school's academic, student, staff and financial reports. Every figure
 * is computed from the same data and helpers the module screens use, so a report always agrees
 * with Finance, Results, Students and Staff.
 */
import { mock, MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  ReportCatalog,
  ReportCatalogItem,
  ReportCell,
  ReportColumn,
  ReportFilter,
  ReportGroup,
  ReportId,
  ReportMetric,
  ReportRow,
  SchoolReport,
  SchoolReportId,
  SheetStatus,
} from '@/types';

import { eventDef } from '../comms-catalog';
import { commsFor, processDue } from '../comms-db';
import { armLabel, offeredSubjects, type AcademicsData, type LevelRec } from '../academics-db';
import type { FinStudent, TermRef } from '../finance-db';
import { isoToday, sum } from '../finance-ledger';
import { studentsData } from '../students-db';
import {
  allArms,
  currentSession,
  fmtDate,
  nowLabel,
  plural,
  subjectName,
  teacherLoad,
} from './academics-shared';
import { schemeFor, sheetView } from './academics-results';
import { financeReport } from './finance-overview';
import { branchNameOf, branchScope, finFor, naira, type FinCtx } from './finance-shared';

/* ---------------- Catalog ---------------- */

const CATALOG: ReportCatalogItem[] = [
  {
    id: 'result-completion',
    group: 'Academic',
    title: 'Result completion',
    description: 'Result sheets by status for the term, per section or class.',
    filters: ['term', 'section'],
  },
  {
    id: 'subject-performance',
    group: 'Academic',
    title: 'Subject performance',
    description: 'Average score, pass rate, highest and lowest per subject, from approved sheets.',
    filters: ['term', 'section'],
  },
  {
    id: 'grade-distribution',
    group: 'Academic',
    title: 'Grade distribution',
    description: 'How many results fall in each grade, per class, from approved sheets.',
    filters: ['term', 'section'],
  },
  {
    id: 'enrollment',
    group: 'Students',
    title: 'Enrollment by class',
    description: 'Active students per class arm by gender, new this session and capacity used.',
    filters: ['section'],
  },
  {
    id: 'admissions',
    group: 'Students',
    title: 'Admissions',
    description: 'Applications by stage, and how many became admitted students.',
    filters: ['status'],
  },
  {
    id: 'movements',
    group: 'Students',
    title: 'Transfers, withdrawals & graduations',
    description: 'Students who left active enrollment, with where they went and why.',
    filters: ['status', 'from', 'to'],
  },
  {
    id: 'staff',
    group: 'Staff',
    title: 'Staff by department',
    description: 'Current staff per department by type, employment and portal access.',
    filters: [],
  },
  {
    id: 'teacher-workload',
    group: 'Staff',
    title: 'Teacher workload',
    description: 'Periods a week against each teacher’s maximum, subjects and classes.',
    filters: ['status'],
  },
  {
    id: 'collection',
    group: 'Financial',
    title: 'Fee collection by class',
    description: 'How much of the term’s billing has been collected, per class.',
    filters: ['term'],
  },
  {
    id: 'outstanding',
    group: 'Financial',
    title: 'Outstanding balances',
    description: 'Students who owe, including earlier sessions, by how long it has been overdue.',
    filters: [],
  },
  {
    id: 'income-expenditure',
    group: 'Financial',
    title: 'Income vs expenditure',
    description: 'Money received and spent each month this session.',
    filters: [],
  },
  {
    id: 'cash-book',
    group: 'Financial',
    title: 'Cash book',
    description: 'Opening balance, money in, money out and closing balance per account.',
    filters: ['term'],
  },
  {
    id: 'payments',
    group: 'Financial',
    title: 'Payments by method & account',
    description: 'Payments received in a period, by payment method and the account paid into.',
    filters: ['status', 'from', 'to'],
  },
  {
    id: 'discounts',
    group: 'Financial',
    title: 'Discounts & waivers',
    description: 'Discounts given on the term’s invoices, by type, and their share of billing.',
    filters: ['term'],
  },
  {
    id: 'message-delivery',
    group: 'Communication',
    title: 'Message delivery summary',
    description: 'Messages sent in a period, by event and channel, and how many reached people.',
    filters: ['from', 'to'],
  },
];

const GROUPS: ReportGroup[] = ['Academic', 'Students', 'Staff', 'Financial', 'Communication'];

mock.get('/v1/reports', (req): ReportCatalog => {
  finFor(req); // signed-in check
  return {
    groups: GROUPS.map((name) => ({ name, reports: CATALOG.filter((r) => r.group === name) })),
  };
});

/* ---------------- Shared helpers ---------------- */

type Q = Record<string, string | undefined>;
const ALL = 'All';
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const count = (n: number) => n.toLocaleString('en-NG');

/** ISO date from a "14 Nov 2026" style label (or an ISO date), else null. */
function isoOf(label: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validDate(value: string | undefined, label: string) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    throw new MockHttpError(422, `${label} isn’t a valid date.`);
  return value;
}

/** Terms of the current session (academic reports) or every term (financial ones). */
function termChoice(ctx: FinCtx, q: Q, scope: 'session' | 'all'): TermRef | null {
  const session = currentSession(ctx.acad);
  const terms = scope === 'all' ? ctx.terms : ctx.terms.filter((t) => t.session === session?.name);
  if (!terms.length) return null;
  const cur = ctx.acad.sessions.flatMap((s) => s.terms).find((t) => t.status === 'Active');
  return (
    terms.find((t) => t.id === q.term) ??
    terms.find((t) => t.name === q.term && t.session === q.session) ??
    terms.find((t) => t.id === cur?.id) ??
    terms[0]!
  );
}

function termFilter(ctx: FinCtx, term: TermRef, scope: 'session' | 'all'): ReportFilter {
  const session = currentSession(ctx.acad);
  return {
    key: 'term',
    label: 'Term',
    kind: 'select',
    value: term.id,
    options: (scope === 'all'
      ? ctx.terms
      : ctx.terms.filter((t) => t.session === session?.name)
    ).map((t) => ({ value: t.id, label: `${t.session} · ${t.name}` })),
  };
}

/** Sections the branch runs classes for, in the school's order. */
function sectionsIn(acad: AcademicsData, branchId: string | null) {
  return acad.sections
    .filter((s) =>
      acad.levels.some((l) => l.section === s.name && (!branchId || l.branchId === branchId)),
    )
    .map((s) => s.name);
}

function sectionFilter(sections: string[], value: string, withAll = true): ReportFilter {
  return {
    key: 'section',
    label: 'Section',
    kind: 'select',
    value,
    options: [
      ...(withAll ? [{ value: ALL, label: 'All sections' }] : []),
      ...sections.map((s) => ({ value: s, label: s })),
    ],
  };
}

const statusFilter = (value: string, options: string[], allLabel = 'All'): ReportFilter => ({
  key: 'status',
  label: 'Status',
  kind: 'select',
  value,
  options: [{ value: ALL, label: allLabel }, ...options.map((o) => ({ value: o, label: o }))],
});

const dateFilters = (from: string, to: string): ReportFilter[] => [
  { key: 'from', label: 'From', kind: 'date', value: from },
  { key: 'to', label: 'To', kind: 'date', value: to },
];

const metric = (
  label: string,
  value: string,
  hint?: string,
  hintTone?: ReportMetric['hintTone'],
): ReportMetric => ({ label, value, ...(hint && { hint }), ...(hintTone && { hintTone }) });

interface Built {
  scope: string;
  filters: ReportFilter[];
  metrics: ReportMetric[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, ReportCell> | null;
  note: string;
  emptyText: string;
}

const blocked = (
  title: string,
  message: string,
  label: string,
  name: string,
): SchoolReport['blocked'] => ({ title, message, action: { label, to: { name } } });

const NO_SESSION = () =>
  blocked(
    'No academic session yet',
    'This report needs a session with its terms. Create one in Sessions & Terms, then come back.',
    'Open Sessions & Terms',
    routesPath.academics.sessions.name,
  );

/* ---------------- Financial (shared with Finance → Reports) ---------------- */

function fromFinance(ctx: FinCtx, req: Pick<MockRequest, 'headers'>, id: ReportId, q: Q): Built {
  const term = termChoice(ctx, q, 'all')!;
  const rep = financeReport(
    { headers: req.headers, query: { ...(q.branch && { branch: q.branch }), term: term.id } },
    id,
  );
  const usesTerm = id === 'collection' || id === 'cash-book';
  const byAdmission = new Map([...ctx.students.values()].map((s) => [s.admissionNo, s.key]));
  const rows: ReportRow[] = rep.rows.map((r) => {
    const key = typeof r.admissionNo === 'string' ? byAdmission.get(r.admissionNo) : undefined;
    return {
      cells: r,
      ...(key && { to: { name: routesPath.finance.studentAccount.name, params: { key } } }),
    };
  });
  const t = rep.totals ?? {};
  const n = (k: string) => (typeof t[k] === 'number' ? (t[k] as number) : 0);
  const metrics: ReportMetric[] =
    id === 'collection'
      ? [
          metric('Billed', naira(n('billed'))),
          metric('Collected', naira(n('collected')), `${n('rate')}% of billing`, 'success'),
          metric('Outstanding', naira(n('outstanding'))),
          metric('Overdue', naira(n('overdue')), undefined, n('overdue') ? 'warning' : undefined),
        ]
      : id === 'outstanding'
        ? [
            metric('Owed in total', naira(n('total'))),
            metric('Students owing', count(rep.rows.length)),
            metric('Not yet due', naira(n('current'))),
            metric(
              'Over 90 days late',
              naira(n('older')),
              undefined,
              n('older') ? 'error' : undefined,
            ),
          ]
        : id === 'income-expenditure'
          ? [
              metric('Income', naira(n('income'))),
              metric('Expenditure', naira(n('expenditure'))),
              metric(
                'Net',
                naira(n('net')),
                n('net') < 0 ? 'More spent than received' : undefined,
                n('net') < 0 ? 'error' : undefined,
              ),
            ]
          : [
              metric('Opening', naira(n('opening'))),
              metric('Money in', naira(n('moneyIn'))),
              metric('Money out', naira(n('moneyOut'))),
              metric('Closing', naira(n('closing'))),
            ];
  return {
    scope: rep.filters,
    filters: usesTerm ? [termFilter(ctx, term, 'all')] : [],
    metrics,
    columns: rep.columns,
    rows,
    totals: rep.totals,
    note: 'Same figures as Finance → Reports. Only confirmed payments count as collected.',
    emptyText: 'Nothing to report for these filters.',
  };
}

function paymentsReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const term = termChoice(ctx, q, 'all')!;
  const today = isoToday();
  const from = validDate(q.from, 'From') || term.start;
  const to = validDate(q.to, 'To') || (today < term.end ? today : term.end);
  if (from > to) throw new MockHttpError(422, 'The start date is after the end date.');
  const STATUSES = ['Confirmed', 'Pending verification', 'Rejected'];
  const status = STATUSES.includes(q.status ?? '') || q.status === ALL ? q.status! : 'Confirmed';
  const inScope = ctx.fin.payments.filter(
    (p) =>
      p.date >= from &&
      p.date <= to &&
      (!branchId || ctx.students.get(p.studentKey)?.branchId === branchId),
  );
  const chosen = inScope.filter((p) => status === ALL || p.status === status);
  const total = sum(chosen.map((p) => p.amount));
  const by = new Map<string, { method: string; account: string; count: number; amount: number }>();
  for (const p of chosen) {
    const account = ctx.fin.accounts.find((a) => a.id === p.accountId)?.name ?? 'Removed account';
    const k = `${p.method}|${account}`;
    const row = by.get(k) ?? { method: p.method, account, count: 0, amount: 0 };
    row.count++;
    row.amount += p.amount;
    by.set(k, row);
  }
  const rows = [...by.values()]
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
    scope: `${fmtDate(from)} – ${fmtDate(to)} · ${branchNameOf(ctx, branchId)} · ${status === ALL ? 'All statuses' : status}`,
    filters: [statusFilter(status, STATUSES, 'All statuses'), ...dateFilters(from, to)],
    metrics: [
      metric(status === ALL ? 'Total' : status, naira(total), plural(chosen.length, 'payment')),
      metric('Average payment', naira(chosen.length ? total / chosen.length : 0)),
      metric(
        'Pending verification',
        naira(sum(pending.map((p) => p.amount))),
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

function discountsReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const term = termChoice(ctx, q, 'all')!;
  const invs = ctx.fin.invoices.filter(
    (i) => i.termId === term.id && i.status === 'Issued' && (!branchId || i.branchId === branchId),
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
        (d.discountId && ctx.fin.discounts.find((x) => x.id === d.discountId)?.name) || d.label;
      const row = by.get(k) ?? { label, students: new Set(), times: 0, amount: 0 };
      row.students.add(inv.studentKey);
      row.times++;
      row.amount += d.amount;
      by.set(k, row);
    }
  const total = sum([...by.values()].map((x) => x.amount));
  const students = new Set(invs.filter((i) => i.discounts.length).map((i) => i.studentKey)).size;
  const rows = [...by.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((x) => ({
      cells: {
        discount: x.label,
        students: x.students.size,
        times: x.times,
        amount: x.amount,
        share: pct(x.amount, gross),
      },
    }));
  return {
    scope: `${term.session} · ${term.name} · ${branchNameOf(ctx, branchId)}`,
    filters: [termFilter(ctx, term, 'all')],
    metrics: [
      metric('Discounts given', naira(total)),
      metric(
        'Students with a discount',
        count(students),
        `of ${count(new Set(invs.map((i) => i.studentKey)).size)} billed`,
      ),
      metric('Share of gross billing', `${pct(total, gross)}%`, `${naira(gross)} before discounts`),
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
          times: sum(rows.map((r) => r.cells.times)),
          amount: total,
          share: pct(total, gross),
        }
      : null,
    note: 'Issued invoices only. Drafts and cancelled invoices are left out.',
    emptyText: 'No discounts on this term’s invoices.',
  };
}

/* ---------------- Academic ---------------- */

const SHEET_STATUSES: SheetStatus[] = [
  'Not started',
  'Draft',
  'Submitted',
  'Under review',
  'Returned',
  'Approved',
  'Published',
];

/** Every offered subject sheet for the term, with its status as the Results screen shows it. */
function sheetCells(acad: AcademicsData, termId: string, branchId: string | null, section: string) {
  return allArms(acad)
    .filter(
      ({ level }) =>
        (!branchId || level.branchId === branchId) &&
        (section === ALL || level.section === section),
    )
    .flatMap(({ level, arm }) => {
      const published = acad.published.includes(`${termId}|${arm.id}`);
      return offeredSubjects(acad, level).map(([code]) => {
        const sheet = acad.sheets.find(
          (x) => x.armId === arm.id && x.subject === code && x.termId === termId,
        );
        const status: SheetStatus = published ? 'Published' : (sheet?.status ?? 'Not started');
        return { level, arm, code, sheet, status };
      });
    });
}

function completionReport(ctx: FinCtx, q: Q, branchId: string | null, term: TermRef): Built {
  const sections = sectionsIn(ctx.acad, branchId);
  const section = sections.includes(q.section ?? '') ? q.section! : ALL;
  const cells = sheetCells(ctx.acad, term.id, branchId, section);
  const keyOf = (c: (typeof cells)[number]) =>
    section === ALL ? c.level.section : armLabel(c.level.name, c.arm.arm);
  const order = [...new Set(cells.map(keyOf))];
  const rows: ReportRow[] = order.map((k) => {
    const mine = cells.filter((c) => keyOf(c) === k);
    const counts = Object.fromEntries(
      SHEET_STATUSES.map((s) => [s, mine.filter((c) => c.status === s).length]),
    );
    const done = (counts.Approved ?? 0) + (counts.Published ?? 0);
    const sec = mine[0]!.level.section;
    return {
      cells: { group: k, sheets: mine.length, ...counts, done: pct(done, mine.length) },
      to: { name: routesPath.academics.results.name, query: { section: sec } },
    };
  });
  const totalCounts = Object.fromEntries(
    SHEET_STATUSES.map((s) => [s, cells.filter((c) => c.status === s).length]),
  );
  const done = (totalCounts.Approved ?? 0) + (totalCounts.Published ?? 0);
  const waiting = (totalCounts.Submitted ?? 0) + (totalCounts['Under review'] ?? 0);
  return {
    scope: `${term.session} · ${term.name} · ${branchNameOf(ctx, branchId)}${section === ALL ? '' : ` · ${section}`}`,
    filters: [termFilter(ctx, term, 'session'), sectionFilter(sections, section)],
    metrics: [
      metric('Result sheets', count(cells.length)),
      metric('Approved or published', `${pct(done, cells.length)}%`, plural(done, 'sheet')),
      metric('Waiting for review', count(waiting), undefined, waiting ? 'warning' : undefined),
      metric(
        'Not started',
        count(totalCounts['Not started'] ?? 0),
        undefined,
        totalCounts['Not started'] ? 'warning' : undefined,
      ),
    ],
    columns: [
      { key: 'group', label: section === ALL ? 'Section' : 'Class' },
      { key: 'sheets', label: 'Sheets', align: 'right' },
      ...SHEET_STATUSES.map((s) => ({ key: s, label: s, align: 'right' as const })),
      { key: 'done', label: 'Complete', align: 'right', percent: true },
    ],
    rows,
    totals: rows.length
      ? { group: 'Total', sheets: cells.length, ...totalCounts, done: pct(done, cells.length) }
      : null,
    note: 'One sheet per subject per class arm. Complete means approved or published.',
    emptyText: 'No classes with subjects in this scope yet.',
  };
}

/** Student totals per approved sheet, as the Results review screen computes them. */
function approvedResults(ctx: FinCtx, term: TermRef, branchId: string | null, section: string) {
  return sheetCells(ctx.acad, term.id, branchId, section)
    .filter((c) => c.sheet && (c.status === 'Approved' || c.status === 'Published'))
    .filter((c) => schemeFor(ctx.acad, c.level.section)?.mode === 'scores')
    .map((c) => ({ ...c, view: sheetView(ctx.schoolId, ctx.acad, c.sheet!) }));
}

function subjectReport(ctx: FinCtx, q: Q, branchId: string | null, term: TermRef): Built {
  const sections = sectionsIn(ctx.acad, branchId);
  const section = sections.includes(q.section ?? '') ? q.section! : ALL;
  const results = approvedResults(ctx, term, branchId, section);
  const pass = ctx.acad.assessment.passMark;
  const by = new Map<string, { sheets: number; totals: number[] }>();
  for (const r of results) {
    const row = by.get(r.code) ?? { sheets: 0, totals: [] };
    row.sheets++;
    row.totals.push(...r.view.rows.map((x) => x.total).filter((x): x is number => x !== null));
    by.set(r.code, row);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((sum(xs) / xs.length) * 10) / 10 : null);
  const rows: ReportRow[] = [...by.entries()]
    .map(([code, x]) => ({
      cells: {
        subject: subjectName(ctx.acad, code),
        sheets: x.sheets,
        students: x.totals.length,
        average: avg(x.totals),
        passRate: pct(x.totals.filter((t) => t >= pass).length, x.totals.length),
        highest: x.totals.length ? Math.max(...x.totals) : null,
        lowest: x.totals.length ? Math.min(...x.totals) : null,
      },
    }))
    .sort((a, b) => (b.cells.average ?? 0) - (a.cells.average ?? 0));
  const all = [...by.values()].flatMap((x) => x.totals);
  const descriptive = sectionsIn(ctx.acad, branchId).filter(
    (s) => schemeFor(ctx.acad, s)?.mode === 'descriptive',
  );
  return {
    scope: `${term.session} · ${term.name} · ${branchNameOf(ctx, branchId)}${section === ALL ? '' : ` · ${section}`}`,
    filters: [termFilter(ctx, term, 'session'), sectionFilter(sections, section)],
    metrics: [
      metric('Approved sheets', count(results.length)),
      metric('Student results', count(all.length)),
      metric('Average score', all.length ? `${avg(all)}%` : '—'),
      metric(
        'Pass rate',
        all.length ? `${pct(all.filter((t) => t >= pass).length, all.length)}%` : '—',
        `Pass mark ${pass}%`,
      ),
    ],
    columns: [
      { key: 'subject', label: 'Subject' },
      { key: 'sheets', label: 'Sheets', align: 'right' },
      { key: 'students', label: 'Results', align: 'right' },
      { key: 'average', label: 'Average', align: 'right', percent: true },
      { key: 'passRate', label: 'Pass rate', align: 'right', percent: true },
      { key: 'highest', label: 'Highest', align: 'right' },
      { key: 'lowest', label: 'Lowest', align: 'right' },
    ],
    rows,
    totals: null,
    note: `Approved and published sheets only; absent or missing scores aren’t averaged.${descriptive.length ? ` ${descriptive.join(', ')} use descriptive ratings and are left out.` : ''}`,
    emptyText: 'No approved result sheets for this term yet.',
  };
}

function gradeReport(ctx: FinCtx, q: Q, branchId: string | null, term: TermRef): Built {
  const sections = sectionsIn(ctx.acad, branchId).filter(
    (s) => schemeFor(ctx.acad, s)?.mode === 'scores',
  );
  const section = sections.includes(q.section ?? '')
    ? q.section!
    : (sections.find((s) => s === 'Junior Secondary') ?? sections[0] ?? '');
  const scheme = section ? schemeFor(ctx.acad, section) : null;
  const grades = scheme?.scale.map((g) => g.grade) ?? [];
  const results = section ? approvedResults(ctx, term, branchId, section) : [];
  const pass = ctx.acad.assessment.passMark;
  const byArm = new Map<
    string,
    { label: string; level: LevelRec; grades: Record<string, number>; n: number; passed: number }
  >();
  for (const r of results) {
    const label = armLabel(r.level.name, r.arm.arm);
    const row = byArm.get(r.arm.id) ?? {
      label,
      level: r.level,
      grades: Object.fromEntries(grades.map((g) => [g, 0])),
      n: 0,
      passed: 0,
    };
    for (const x of r.view.rows) {
      if (x.total === null || !x.grade) continue;
      row.grades[x.grade] = (row.grades[x.grade] ?? 0) + 1;
      row.n++;
      if (x.total >= pass) row.passed++;
    }
    byArm.set(r.arm.id, row);
  }
  const rows: ReportRow[] = [...byArm.entries()].map(([armId, x]) => ({
    cells: { class: x.label, results: x.n, ...x.grades, passRate: pct(x.passed, x.n) },
    to: { name: routesPath.academics.classDetail.name, params: { id: armId } },
  }));
  const n = sum([...byArm.values()].map((x) => x.n));
  const passed = sum([...byArm.values()].map((x) => x.passed));
  const top = grades[0];
  return {
    scope: `${term.session} · ${term.name} · ${branchNameOf(ctx, branchId)} · ${section || 'No scored section'}`,
    filters: [termFilter(ctx, term, 'session'), sectionFilter(sections, section, false)],
    metrics: [
      metric('Graded results', count(n)),
      metric('Pass rate', n ? `${pct(passed, n)}%` : '—', `Pass mark ${pass}%`),
      ...(top
        ? [
            metric(
              `Grade ${top}`,
              n ? `${pct(sum([...byArm.values()].map((x) => x.grades[top] ?? 0)), n)}%` : '—',
              'of graded results',
            ),
          ]
        : []),
    ],
    columns: [
      { key: 'class', label: 'Class' },
      { key: 'results', label: 'Results', align: 'right' },
      ...grades.map((g) => ({ key: g, label: g, align: 'right' as const })),
      { key: 'passRate', label: 'Pass rate', align: 'right', percent: true },
    ],
    rows,
    totals: rows.length
      ? {
          class: 'Total',
          results: n,
          ...Object.fromEntries(
            grades.map((g) => [g, sum([...byArm.values()].map((x) => x.grades[g] ?? 0))]),
          ),
          passRate: pct(passed, n),
        }
      : null,
    note: 'Grades use the section’s grading scale. Approved and published sheets only.',
    emptyText: section
      ? 'No approved result sheets for this section and term yet.'
      : 'No section uses scored assessments yet.',
  };
}

/* ---------------- Students ---------------- */

function levelOf(acad: AcademicsData, s: FinStudent) {
  return acad.levels.find((l) => l.branchId === s.branchId && l.name === s.level) ?? null;
}

function enrollmentReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const sections = sectionsIn(ctx.acad, branchId);
  const section = sections.includes(q.section ?? '') ? q.section! : ALL;
  const students = [...ctx.students.values()].filter(
    (s) => s.active && (!branchId || s.branchId === branchId),
  );
  const inSection = students.filter(
    (s) => section === ALL || levelOf(ctx.acad, s)?.section === section,
  );
  const arms = allArms(ctx.acad).filter(
    ({ level }) =>
      (!branchId || level.branchId === branchId) && (section === ALL || level.section === section),
  );
  const placedKeys = new Set<string>();
  const rows: ReportRow[] = arms.map(({ level, arm }) => {
    const mine = inSection.filter(
      (s) => s.branchId === level.branchId && s.level === level.name && s.arm === arm.arm,
    );
    for (const s of mine) placedKeys.add(s.key);
    return {
      cells: {
        class: armLabel(level.name, arm.arm),
        ...(branchId ? {} : { branch: branchNameOf(ctx, level.branchId) }),
        section: level.section,
        male: mine.filter((s) => s.gender === 'Male').length,
        female: mine.filter((s) => s.gender === 'Female').length,
        total: mine.length,
        isNew: mine.filter((s) => s.isNew).length,
        capacity: arm.capacity,
        fill: pct(mine.length, arm.capacity),
      },
      to: { name: routesPath.academics.classDetail.name, params: { id: arm.id } },
    };
  });
  // Admitted but not yet placed, or in an arm that no longer exists.
  const unplaced = inSection.filter((s) => !placedKeys.has(s.key));
  if (unplaced.length)
    rows.push({
      cells: {
        class: 'Not placed in a class',
        ...(branchId ? {} : { branch: '' }),
        section: '',
        male: unplaced.filter((s) => s.gender === 'Male').length,
        female: unplaced.filter((s) => s.gender === 'Female').length,
        total: unplaced.length,
        isNew: unplaced.filter((s) => s.isNew).length,
        capacity: null,
        fill: null,
      },
      to: { name: routesPath.students.enrollment.name },
    });
  const male = inSection.filter((s) => s.gender === 'Male').length;
  const female = inSection.filter((s) => s.gender === 'Female').length;
  const capacity = sum(arms.map(({ arm }) => arm.capacity));
  const placed = inSection.length - unplaced.length;
  return {
    scope: `${currentSession(ctx.acad)?.name ?? 'Current session'} · ${branchNameOf(ctx, branchId)}${section === ALL ? '' : ` · ${section}`}`,
    filters: [sectionFilter(sections, section)],
    metrics: [
      metric('Active students', count(inSection.length)),
      metric('Girls · boys', `${count(female)} · ${count(male)}`),
      metric('New this session', count(inSection.filter((s) => s.isNew).length)),
      metric(
        'Places used',
        `${pct(placed, capacity)}%`,
        `${count(placed)} of ${count(capacity)}`,
        placed > capacity ? 'error' : undefined,
      ),
    ],
    columns: [
      { key: 'class', label: 'Class' },
      ...(branchId ? [] : [{ key: 'branch', label: 'Branch' }]),
      { key: 'section', label: 'Section' },
      { key: 'male', label: 'Male', align: 'right' },
      { key: 'female', label: 'Female', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'isNew', label: 'New', align: 'right' },
      { key: 'capacity', label: 'Capacity', align: 'right' },
      { key: 'fill', label: 'Filled', align: 'right', percent: true },
    ],
    rows,
    totals: rows.length
      ? {
          class: 'Total',
          ...(branchId ? {} : { branch: '' }),
          section: '',
          male,
          female,
          total: inSection.length,
          isNew: inSection.filter((s) => s.isNew).length,
          capacity,
          fill: pct(placed, capacity),
        }
      : null,
    note: 'Active and incomplete-profile students. Transferred, withdrawn and graduated students are left out.',
    emptyText: 'No students enrolled yet.',
  };
}

const STAGES = ['Pending', 'Under review', 'Offer accepted', 'Admitted', 'Rejected'] as const;

function admissionsReport(ctx: FinCtx, q: Q): Built {
  const apps = studentsData[ctx.schoolId]!.applications;
  const status = (STAGES as readonly string[]).includes(q.status ?? '') ? q.status! : ALL;
  const chosen = apps.filter((a) => status === ALL || a.stage === status);
  const admitted = apps.filter((a) => a.stage === 'Admitted').length;
  const decided = apps.filter((a) => a.stage === 'Admitted' || a.stage === 'Rejected').length;
  const open = apps.filter((a) => !['Admitted', 'Rejected'].includes(a.stage)).length;
  return {
    scope: `${currentSession(ctx.acad)?.name ?? 'Current session'} · all branches · ${status === ALL ? 'All stages' : status}`,
    filters: [statusFilter(status, [...STAGES], 'All stages')],
    metrics: [
      metric('Applications', count(apps.length)),
      metric('Still open', count(open), undefined, open ? 'warning' : undefined),
      metric('Admitted', count(admitted)),
      metric(
        'Admission rate',
        decided ? `${pct(admitted, decided)}%` : '—',
        'of decided applications',
      ),
    ],
    columns: [
      { key: 'applicant', label: 'Applicant' },
      { key: 'applyingFor', label: 'Applying for' },
      { key: 'type', label: 'Type' },
      { key: 'applied', label: 'Applied' },
      { key: 'guardian', label: 'Parent / guardian' },
      { key: 'stage', label: 'Stage' },
    ],
    rows: chosen.map((a) => ({
      cells: {
        applicant: a.applicant,
        applyingFor: a.applyingFor,
        type: a.type,
        applied: a.applied,
        guardian: a.guardian,
        stage: a.stage,
      },
      to: a.studentId
        ? { name: routesPath.students.detail.name, params: { id: a.studentId } }
        : { name: routesPath.students.admissions.name },
    })),
    totals: null,
    note: 'Applications are school-wide; they’re placed in a branch when admitted.',
    emptyText: status === ALL ? 'No applications yet.' : `No applications at the ${status} stage.`,
  };
}

const MOVES = ['Transferred', 'Withdrawn', 'Graduated'] as const;

function movementsReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const status = (MOVES as readonly string[]).includes(q.status ?? '') ? q.status! : ALL;
  const from = validDate(q.from, 'From');
  const to = validDate(q.to, 'To');
  if (from && to && from > to)
    throw new MockHttpError(422, 'The start date is after the end date.');
  const branch = branchId ? branchNameOf(ctx, branchId) : null;
  type Move = {
    cells: Record<string, ReportCell>;
    iso: string;
    type: string;
    to?: ReportRow['to'];
  };
  const moves: Move[] = studentsData[ctx.schoolId]!.students.filter(
    (s) => (MOVES as readonly string[]).includes(s.status) && (!branch || s.branch === branch),
  ).map((s) => {
    const iso = isoOf(s.exit?.date ?? '') ?? '';
    return {
      iso,
      type: s.status,
      cells: {
        student: `${s.firstName} ${s.surname}`.trim(),
        from: s.arm ? armLabel(s.level, s.arm) : s.level,
        type: s.status,
        effective: iso ? fmtDate(iso) : '—',
        detail: [s.exit?.destination, s.exit?.reason].filter(Boolean).join(' · ') || '—',
      },
      to: { name: routesPath.students.detail.name, params: { id: s.id } },
    };
  });
  // Whole classes that graduated at the end of the previous session.
  const promo = ctx.acad.promotion;
  if (promo) {
    const end = ctx.acad.sessions.find((x) => x.id === promo.fromSessionId)?.end ?? '';
    for (const c of promo.classes.filter((x) => x.status === 'Graduated'))
      moves.push({
        iso: end,
        type: 'Graduated',
        cells: {
          student: `${c.name} class (${plural(c.total, 'student')})`,
          from: c.name,
          type: 'Graduated',
          effective: end ? fmtDate(end) : '—',
          detail: 'Completed the final class',
        },
        to: { name: routesPath.academics.promotion.name },
      });
  }
  const chosen = moves
    .filter(
      (m) =>
        (status === ALL || m.type === status) &&
        (!from || m.iso >= from) &&
        (!to || (m.iso && m.iso <= to)),
    )
    .sort((a, b) => b.iso.localeCompare(a.iso));
  const n = (t: string) => moves.filter((m) => m.type === t).length;
  const range =
    from || to ? ` · ${from ? fmtDate(from) : 'start'} – ${to ? fmtDate(to) : 'today'}` : '';
  return {
    scope: `${branchNameOf(ctx, branchId)}${range}`,
    filters: [statusFilter(status, [...MOVES], 'All movements'), ...dateFilters(from, to)],
    metrics: [
      metric('Transferred', count(n('Transferred'))),
      metric('Withdrawn', count(n('Withdrawn'))),
      metric('Graduated', count(n('Graduated')), 'records and whole classes'),
    ],
    columns: [
      { key: 'student', label: 'Student' },
      { key: 'from', label: 'From class' },
      { key: 'type', label: 'Type' },
      { key: 'effective', label: 'Effective' },
      { key: 'detail', label: 'Destination / reason' },
    ],
    rows: chosen.map(({ cells, to: link }) => ({ cells, ...(link && { to: link }) })),
    totals: null,
    note: 'Students keep their records, invoices and results after they leave.',
    emptyText: 'No students left in this period.',
  };
}

/* ---------------- Staff ---------------- */

function staffReport(ctx: FinCtx, branchId: string | null): Built {
  const accountOf = (id: string) =>
    ctx.data.users.find((u) => u.staffId === id && u.status !== 'Revoked')?.status ?? 'No account';
  const staff = ctx.data.staff.filter(
    (s) => !s.left && (!branchId || s.branchIds.includes(branchId)),
  );
  const depts = [...new Set(staff.map((s) => s.department))].sort();
  const rowOf = (list: typeof staff) => ({
    total: list.length,
    teaching: list.filter((s) => s.kind === 'Teaching').length,
    nonTeaching: list.filter((s) => s.kind !== 'Teaching').length,
    fullTime: list.filter((s) => s.employment === 'Full-time').length,
    partTime: list.filter((s) => s.employment === 'Part-time').length,
    contract: list.filter((s) => s.employment === 'Contract').length,
    access: list.filter((s) => ['Active', 'Invited', 'Suspended'].includes(accountOf(s.id))).length,
    noAccess: list.filter((s) => accountOf(s.id) === 'No account').length,
  });
  const rows: ReportRow[] = depts.map((d) => ({
    cells: { department: d, ...rowOf(staff.filter((s) => s.department === d)) },
    to: { name: routesPath.staff.directory.name },
  }));
  const all = rowOf(staff);
  return {
    scope: `${branchNameOf(ctx, branchId)} · current staff`,
    filters: [],
    metrics: [
      metric('Current staff', count(all.total)),
      metric('Teaching', count(all.teaching)),
      metric('Non-teaching', count(all.nonTeaching)),
      metric(
        'Without portal access',
        count(all.noAccess),
        undefined,
        all.noAccess ? 'warning' : undefined,
      ),
    ],
    columns: [
      { key: 'department', label: 'Department' },
      { key: 'total', label: 'Staff', align: 'right' },
      { key: 'teaching', label: 'Teaching', align: 'right' },
      { key: 'nonTeaching', label: 'Non-teaching', align: 'right' },
      { key: 'fullTime', label: 'Full-time', align: 'right' },
      { key: 'partTime', label: 'Part-time', align: 'right' },
      { key: 'contract', label: 'Contract', align: 'right' },
      { key: 'access', label: 'Portal access', align: 'right' },
      { key: 'noAccess', label: 'No access', align: 'right' },
    ],
    rows,
    totals: rows.length ? { department: 'Total', ...all } : null,
    note: 'Staff who work across branches count in each branch they work at. Deactivated staff are left out.',
    emptyText: 'No staff added yet.',
  };
}

/* ---------------- Communication ---------------- */

/** Delivery Logs, summarised: one row per event and channel, counted per recipient. */
function deliveryReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const c = commsFor(ctx.schoolId);
  processDue(c);
  const today = isoToday();
  const term = termChoice(ctx, q, 'all');
  const back = new Date();
  back.setDate(back.getDate() - 90);
  const fallback = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}-${String(back.getDate()).padStart(2, '0')}`;
  const from = validDate(q.from, 'From') || (term && term.start <= today ? term.start : fallback);
  const to = validDate(q.to, 'To') || today;
  if (from > to) throw new MockHttpError(422, 'The start date is after the end date.');
  type Acc = {
    event: string;
    channel: string;
    messages: Set<string>;
    sent: number;
    delivered: number;
    read: number;
    pending: number;
    failed: number;
    units: number;
  };
  const by = new Map<string, Acc>();
  for (const m of c.messages) {
    const day = m.at.slice(0, 10);
    if (day < from || day > to) continue;
    for (const r of m.recipients) {
      if (branchId && r.branchId && r.branchId !== branchId) continue;
      for (const [channel, o] of Object.entries(r.out)) {
        if (!o) continue;
        const k = `${m.event}|${channel}`;
        const row: Acc = by.get(k) ?? {
          event: eventDef(m.event)?.label ?? m.event,
          channel,
          messages: new Set(),
          sent: 0,
          delivered: 0,
          read: 0,
          pending: 0,
          failed: 0,
          units: 0,
        };
        row.messages.add(m.id);
        row.sent++;
        if (o.status === 'Delivered' || o.status === 'Read') row.delivered++;
        if (o.status === 'Read') row.read++;
        if (o.status === 'Queued' || o.status === 'Sent') row.pending++;
        if (o.status === 'Failed') row.failed++;
        row.units += o.units;
        by.set(k, row);
      }
    }
  }
  const all = [...by.values()];
  const rows: ReportRow[] = all
    .sort((a, b) => a.event.localeCompare(b.event) || a.channel.localeCompare(b.channel))
    .map((x) => ({
      cells: {
        event: x.event,
        channel: x.channel,
        messages: x.messages.size,
        sent: x.sent,
        delivered: x.delivered,
        read: x.channel === 'SMS' ? null : x.read,
        pending: x.pending,
        failed: x.failed,
        rate: pct(x.delivered, x.sent),
        units: x.channel === 'SMS' ? x.units : null,
      },
      to: { name: routesPath.communication.delivery.name },
    }));
  const t = (k: keyof Omit<Acc, 'event' | 'channel' | 'messages'>) => sum(all.map((x) => x[k]));
  const sent = t('sent');
  const failed = t('failed');
  const units = sum(all.filter((x) => x.channel === 'SMS').map((x) => x.units));
  const messages = new Set(all.flatMap((x) => [...x.messages])).size;
  return {
    scope: `${fmtDate(from)} – ${fmtDate(to)} · ${branchNameOf(ctx, branchId)}`,
    filters: dateFilters(from, to),
    metrics: [
      metric('Messages', count(messages), plural(sent, 'delivery', 'deliveries')),
      metric(
        'Reached',
        `${pct(t('delivered'), sent)}%`,
        `${count(t('delivered'))} delivered or read`,
      ),
      metric(
        'Failed',
        count(failed),
        failed ? 'Retry or fix contacts in Delivery Logs' : undefined,
        failed ? 'warning' : undefined,
      ),
      metric('SMS used', `${count(units)} units`, naira(units * 4)),
    ],
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'channel', label: 'Channel' },
      { key: 'messages', label: 'Messages', align: 'right' },
      { key: 'sent', label: 'Recipients', align: 'right' },
      { key: 'delivered', label: 'Delivered', align: 'right' },
      { key: 'read', label: 'Read / opened', align: 'right' },
      { key: 'pending', label: 'Pending', align: 'right' },
      { key: 'failed', label: 'Failed', align: 'right' },
      { key: 'rate', label: 'Reached', align: 'right', percent: true },
      { key: 'units', label: 'SMS units', align: 'right' },
    ],
    rows,
    totals: rows.length
      ? {
          event: 'Total',
          channel: '',
          messages,
          sent,
          delivered: t('delivered'),
          read: sum(all.filter((x) => x.channel !== 'SMS').map((x) => x.read)),
          pending: t('pending'),
          failed,
          rate: pct(t('delivered'), sent),
          units,
        }
      : null,
    note: 'Counted per recipient and channel, the same way Delivery Logs counts them. A branch filter counts recipients at that branch; school-wide recipients such as staff at several branches count everywhere. SMS is estimated at ₦4 a unit.',
    emptyText: 'No messages were sent in this period.',
  };
}

const LOADS = ['Over maximum', 'Near maximum', 'Within load', 'No assignments'] as const;

function workloadReport(ctx: FinCtx, q: Q, branchId: string | null): Built {
  const status = (LOADS as readonly string[]).includes(q.status ?? '') ? q.status! : ALL;
  const teachers = ctx.data.staff
    .filter(
      (s) => s.kind === 'Teaching' && !s.left && (!branchId || s.branchIds.includes(branchId)),
    )
    .map((s) => {
      const mine = ctx.acad.assignments.filter((a) => a.teacherId === s.id);
      const periods = teacherLoad(ctx.acad, s.id);
      const load = !mine.length
        ? 'No assignments'
        : periods > s.maxPeriods
          ? 'Over maximum'
          : periods >= s.maxPeriods * 0.9
            ? 'Near maximum'
            : 'Within load';
      const classTeacher = allArms(ctx.acad)
        .filter(({ arm }) => arm.classTeacherId === s.id)
        .map(({ level, arm }) => armLabel(level.name, arm.arm));
      return {
        id: s.id,
        load,
        periods,
        cells: {
          teacher: s.name,
          employment: s.employment,
          subjects: new Set(mine.map((a) => a.subject)).size,
          classes: new Set(mine.map((a) => a.armId)).size,
          periods,
          max: s.maxPeriods,
          used: pct(periods, s.maxPeriods),
          classTeacher: classTeacher.join(', ') || '—',
          load,
        } as Record<string, ReportCell>,
      };
    })
    .sort((a, b) => b.periods - a.periods);
  const chosen = teachers.filter((t) => status === ALL || t.load === status);
  const n = (l: string) => teachers.filter((t) => t.load === l).length;
  return {
    scope: `${branchNameOf(ctx, branchId)} · ${currentSession(ctx.acad)?.name ?? 'current session'}`,
    filters: [statusFilter(status, [...LOADS], 'All teachers')],
    metrics: [
      metric('Teachers', count(teachers.length)),
      metric(
        'Over maximum',
        count(n('Over maximum')),
        undefined,
        n('Over maximum') ? 'error' : undefined,
      ),
      metric(
        'Near maximum',
        count(n('Near maximum')),
        '90% or more',
        n('Near maximum') ? 'warning' : undefined,
      ),
      metric(
        'No assignments',
        count(n('No assignments')),
        undefined,
        n('No assignments') ? 'warning' : undefined,
      ),
    ],
    columns: [
      { key: 'teacher', label: 'Teacher' },
      { key: 'employment', label: 'Employment' },
      { key: 'subjects', label: 'Subjects', align: 'right' },
      { key: 'classes', label: 'Classes', align: 'right' },
      { key: 'periods', label: 'Periods/wk', align: 'right' },
      { key: 'max', label: 'Maximum', align: 'right' },
      { key: 'used', label: 'Load', align: 'right', percent: true },
      { key: 'classTeacher', label: 'Class teacher of' },
      { key: 'load', label: 'Status' },
    ],
    rows: chosen.map((t) => ({
      cells: t.cells,
      to: { name: routesPath.staff.detail.name, params: { id: t.id } },
    })),
    totals: null,
    note: 'Periods come from Teacher Assignments and each subject’s periods a week.',
    emptyText: teachers.length ? 'No teachers match this status.' : 'No teaching staff yet.',
  };
}

/* ---------------- One report ---------------- */

const ACADEMIC = new Set<SchoolReportId>([
  'result-completion',
  'subject-performance',
  'grade-distribution',
]);
const TERMED = new Set<SchoolReportId>([
  'collection',
  'cash-book',
  'payments',
  'discounts',
  'outstanding',
  'income-expenditure',
]);

export function schoolReport(
  req: Pick<MockRequest, 'headers' | 'query'>,
  id: string,
): SchoolReport {
  const meta = CATALOG.find((r) => r.id === id);
  if (!meta) throw new MockHttpError(404, 'This report doesn’t exist.');
  const ctx = finFor(req);
  const q = req.query as Q;
  const branchId = branchScope(ctx, q.branch);
  const head = {
    id: meta.id,
    group: meta.group,
    title: meta.title,
    description: meta.description,
    generatedAt: nowLabel(),
  };
  const sessionTerm = termChoice(ctx, q, 'session');
  if ((ACADEMIC.has(meta.id) && !sessionTerm) || (TERMED.has(meta.id) && !ctx.terms.length))
    return {
      ...head,
      scope: branchNameOf(ctx, branchId),
      filters: [],
      metrics: [],
      columns: [],
      rows: [],
      totals: null,
      note: '',
      emptyText: '',
      blocked: NO_SESSION(),
    };
  const built: Built = (() => {
    switch (meta.id) {
      case 'collection':
      case 'outstanding':
      case 'income-expenditure':
      case 'cash-book':
        return fromFinance(ctx, req, meta.id, q);
      case 'payments':
        return paymentsReport(ctx, q, branchId);
      case 'discounts':
        return discountsReport(ctx, q, branchId);
      case 'result-completion':
        return completionReport(ctx, q, branchId, sessionTerm!);
      case 'subject-performance':
        return subjectReport(ctx, q, branchId, sessionTerm!);
      case 'grade-distribution':
        return gradeReport(ctx, q, branchId, sessionTerm!);
      case 'enrollment':
        return enrollmentReport(ctx, q, branchId);
      case 'admissions':
        return admissionsReport(ctx, q);
      case 'movements':
        return movementsReport(ctx, q, branchId);
      case 'staff':
        return staffReport(ctx, branchId);
      case 'teacher-workload':
        return workloadReport(ctx, q, branchId);
      case 'message-delivery':
        return deliveryReport(ctx, q, branchId);
    }
  })();
  return { ...head, ...built, blocked: null };
}

mock.get('/v1/reports/:id', (req): SchoolReport => schoolReport(req, req.params.id!));
