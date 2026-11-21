import { Injectable } from '@nestjs/common';
import { ENROLLED } from '../shared/enrolled.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ApplicationStage, StudentStatus } from '../../generated/prisma/enums.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import { fail, fmtDate, isIso, isoDate, plural, staffName } from '../academics/academic-format.js';
import { STAGE_LABEL, ADMISSION_TYPE_LABEL } from '../admissions/admissions-view.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { FinanceOverviewService } from '../finance/overview.service.js';
import { stamp } from '../results/results-core.service.js';
import { mean, round1 } from '../results/scoring.js';
import { EMPLOYMENT_LABEL, HOLDS_ACCESS } from '../staff/staff-view.js';
import { ON_ROLL, STATUS_LABEL, armLabel, studentName } from '../students/student-view.js';
import { ROUTE } from './dashboard.service.js';
import { InsightsResultsService } from './insights-results.service.js';
import { ALL_BRANCHES, InsightsScopeService, type BranchScope } from './insights-scope.service.js';
import {
  CATALOG,
  GROUPS,
  type Built,
  type ReportCell,
  type ReportFilter,
  type ReportMetric,
  type ReportRow,
  type SchoolReportId,
} from './reports-catalog.js';

type Q = {
  branch?: string;
  session?: string;
  term?: string;
  section?: string;
  from?: string;
  to?: string;
  status?: string;
};
type Found = NonNullable<Awaited<ReturnType<InsightsScopeService['term']>>>;
type WithTerm = Found & { term: NonNullable<Found['term']> };

const ALL = 'All';
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const count = (n: number) => n.toLocaleString('en-NG');
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg1 = (xs: number[]) => (xs.length ? round1(mean(xs)!) : null);

const metric = (
  label: string,
  value: string,
  hint?: string,
  hintTone?: ReportMetric['hintTone'],
): ReportMetric => ({ label, value, ...(hint && { hint }), ...(hintTone && { hintTone }) });

const statusFilter = (value: string, options: string[], allLabel: string): ReportFilter => ({
  key: 'status',
  label: 'Status',
  kind: 'select',
  value,
  options: [{ value: ALL, label: allLabel }, ...options.map((o) => ({ value: o, label: o }))],
});

const sectionFilter = (sections: string[], value: string, withAll = true): ReportFilter => ({
  key: 'section',
  label: 'Section',
  kind: 'select',
  value,
  options: [
    ...(withAll ? [{ value: ALL, label: 'All sections' }] : []),
    ...sections.map((s) => ({ value: s, label: s })),
  ],
});

const dateFilters = (from: string, to: string): ReportFilter[] => [
  { key: 'from', label: 'From', kind: 'date', value: from },
  { key: 'to', label: 'To', kind: 'date', value: to },
];

/** Section names the arms belong to, in the school's section order (arms come sorted). */
const sectionsOf = (arms: ArmInfo[]) => [...new Set(arms.map((a) => a.section))];

const SHEET_COLUMNS = [
  'Not started',
  'Draft',
  'Submitted',
  'Under review',
  'Returned',
  'Approved',
  'Published',
] as const;

/** Reports that need the current session (and a term, for the termed ones). */
const NEEDS_TERM = new Set<SchoolReportId>([
  'result-completion',
  'subject-performance',
  'grade-distribution',
  'attendance',
]);
const NO_SESSION_BLOCK = {
  title: 'No academic session yet',
  message:
    'This report needs a session with its terms. Create one in Sessions & Terms, then come back.',
  action: { label: 'Open Sessions & Terms', to: { name: ROUTE.sessions } },
};
const NEEDS_SESSION = new Set<SchoolReportId>(['enrollment']);

const STAGES: ApplicationStage[] = [
  'PENDING',
  'UNDER_REVIEW',
  'OFFER_ACCEPTED',
  'ADMITTED',
  'REJECTED',
];
const MOVES: { status: StudentStatus; label: string }[] = [
  { status: 'TRANSFERRED', label: 'Transferred' },
  { status: 'WITHDRAWN', label: 'Withdrawn' },
  { status: 'GRADUATED', label: 'Graduated' },
];
const LOADS = ['Over maximum', 'Near maximum', 'Within load', 'No assignments'] as const;

/**
 * School Admin › Reports, from live records: results (completion, subject performance, grade
 * distribution), students (enrolment, attendance, admissions, leavers) and staff (departments,
 * teaching load) and Finance (from its ledger), each for the header's working branch.
 * Communication reports are listed but can't be opened until that module is built. Shapes follow the School Admin mock
 * (`handlers/reports.ts`).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly scope: InsightsScopeService,
    private readonly results: InsightsResultsService,
    private readonly attendance: AttendanceService,
    private readonly finances: FinanceOverviewService,
  ) {}

  private get db() {
    return this.scope.db;
  }

  catalog() {
    return {
      groups: GROUPS.map((name) => ({ name, reports: CATALOG.filter((r) => r.group === name) })),
    };
  }

  async report(id: string, q: Q) {
    const meta = CATALOG.find((r) => r.id === id);
    if (!meta) throw AppException.notFound('This report doesn’t exist.', 'REPORT_NOT_FOUND');
    const branch = await this.scope.branch(q.branch);
    const head = {
      id: meta.id,
      group: meta.group,
      title: meta.title,
      description: meta.description,
      generatedAt: stamp(this.scope.now()),
    };
    const empty = {
      scope: branch.name,
      filters: [],
      metrics: [],
      columns: [],
      rows: [],
      totals: null,
      note: '',
      emptyText: '',
    };
    if (!meta.available)
      return {
        ...head,
        ...empty,
        blocked: {
          title: `Available with ${meta.availableWith}`,
          message:
            meta.availableWith === 'Communication'
              ? `${meta.title} is worked out from the messages your school sends. It becomes available when Communication is set up.`
              : `${meta.title} is worked out from invoices, payments and expenses. It becomes available when Finance is set up for your school.`,
          action: { label: 'Back to reports', to: { name: ROUTE.reports } },
        },
      };
    if (meta.group === 'Financial') {
      if (!(await this.finances.hasTerms()))
        return { ...head, ...empty, blocked: NO_SESSION_BLOCK };
      const built = await this.finances.schoolReport(meta.id, q, branch.id);
      return { ...head, ...built, blocked: null };
    }
    const found = await this.scope.term(q.term);
    if ((NEEDS_TERM.has(meta.id) && !found?.term) || (NEEDS_SESSION.has(meta.id) && !found))
      return { ...head, ...empty, blocked: NO_SESSION_BLOCK };
    const termed = found as WithTerm;
    const built: Built = await (() => {
      switch (meta.id) {
        case 'result-completion':
          return this.completion(q, branch, termed);
        case 'subject-performance':
          return this.subjects(q, branch, termed);
        case 'grade-distribution':
          return this.grades(q, branch, termed);
        case 'attendance':
          return this.attendanceReport(q, branch, termed);
        case 'enrollment':
          return this.enrollment(q, branch, found!);
        case 'admissions':
          return this.admissions(q, found);
        case 'movements':
          return this.movements(q, branch);
        case 'staff':
          return this.staff(branch);
        default:
          return this.workload(q, branch, found);
      }
    })();
    return { ...head, ...built, blocked: null };
  }

  /* ---------------- Shared ---------------- */

  private termFilter(found: WithTerm): ReportFilter {
    return {
      key: 'term',
      label: 'Term',
      kind: 'select',
      value: found.term.id,
      options: found.session.terms.map((t) => ({
        value: t.id,
        label: `${found.session.name} · ${t.name}`,
      })),
    };
  }

  private termScope(found: WithTerm, branch: BranchScope, section = ALL) {
    return `${found.session.name} · ${found.term.name} · ${branch.name}${section === ALL ? '' : ` · ${section}`}`;
  }

  private date(value: string | undefined, label: string) {
    if (!value) return '';
    if (!isIso(value)) throw fail(`${label} isn’t a valid date.`, 'VALIDATION');
    return value;
  }

  /* ---------------- Academic ---------------- */

  private async completion(q: Q, branch: BranchScope, found: WithTerm): Promise<Built> {
    const allArms = await this.results.arms(branch.id);
    const sections = sectionsOf(allArms);
    const section = sections.includes(q.section ?? '') ? q.section! : ALL;
    const arms = section === ALL ? allArms : allArms.filter((a) => a.section === section);
    const cells = await this.results.cells(found.term, arms);
    const keyOf = (c: (typeof cells)[number]) => (section === ALL ? c.arm.section : c.arm.label);
    const tally = (list: typeof cells) =>
      Object.fromEntries(SHEET_COLUMNS.map((s) => [s, list.filter((c) => c.label === s).length]));
    const rows: ReportRow[] = [...new Set(cells.map(keyOf))].map((k) => {
      const mine = cells.filter((c) => keyOf(c) === k);
      const counts = tally(mine);
      const done = (counts.Approved ?? 0) + (counts.Published ?? 0);
      return {
        cells: { group: k, sheets: mine.length, ...counts, done: pct(done, mine.length) },
        to: { name: ROUTE.results, query: { section: mine[0]!.arm.section } },
      };
    });
    const totals = tally(cells);
    const done = (totals.Approved ?? 0) + (totals.Published ?? 0);
    const office = cells.filter((c) => c.withOffice).length;
    const hod = cells.filter((c) => c.withHod).length;
    return {
      scope: this.termScope(found, branch, section),
      filters: [this.termFilter(found), sectionFilter(sections, section)],
      metrics: [
        metric('Result sheets', count(cells.length)),
        metric('Approved or published', `${pct(done, cells.length)}%`, plural(done, 'sheet')),
        metric(
          'Awaiting your review',
          count(office),
          hod ? `${plural(hod, 'more sheet')} with HODs` : undefined,
          office ? 'warning' : undefined,
        ),
        metric(
          'Not started',
          count(totals['Not started'] ?? 0),
          undefined,
          totals['Not started'] ? 'warning' : undefined,
        ),
      ],
      columns: [
        { key: 'group', label: section === ALL ? 'Section' : 'Class' },
        { key: 'sheets', label: 'Sheets', align: 'right' },
        ...SHEET_COLUMNS.map((s) => ({
          key: s,
          label: s === 'Submitted' ? 'With HOD' : s,
          align: 'right' as const,
        })),
        { key: 'done', label: 'Complete', align: 'right', percent: true },
      ],
      rows,
      totals: rows.length
        ? { group: 'Total', sheets: cells.length, ...totals, done: pct(done, cells.length) }
        : null,
      note: 'One sheet per subject per class arm. With HOD sheets are waiting on the department’s HOD; Under review sheets are with the academic office. Complete means approved or published.',
      emptyText: 'No classes with subjects in this scope yet.',
    };
  }

  private async subjects(q: Q, branch: BranchScope, found: WithTerm): Promise<Built> {
    const allArms = await this.results.arms(branch.id);
    const sections = sectionsOf(allArms);
    const section = sections.includes(q.section ?? '') ? q.section! : ALL;
    const arms = section === ALL ? allArms : allArms.filter((a) => a.section === section);
    const [ctxs, schemes] = await Promise.all([
      this.results.approved(found.term, arms),
      this.results.schemes(found.session.id),
    ]);
    const by = new Map<
      string,
      { name: string; sheets: number; totals: number[]; passed: number }
    >();
    const passMarks = new Set<number>();
    for (const c of ctxs) {
      const row = by.get(c.sheet.subjectId) ?? {
        name: c.sheet.subject.name,
        sheets: 0,
        totals: [],
        passed: 0,
      };
      const totals = c.rows.map((r) => r.total).filter((x): x is number => x !== null);
      row.sheets++;
      row.totals.push(...totals);
      row.passed += totals.filter((t) => t >= c.scheme.passMark).length;
      passMarks.add(c.scheme.passMark);
      by.set(c.sheet.subjectId, row);
    }
    const rows: ReportRow[] = [...by.values()]
      .map((x) => ({
        cells: {
          subject: x.name,
          sheets: x.sheets,
          students: x.totals.length,
          average: avg1(x.totals),
          passRate: pct(x.passed, x.totals.length),
          highest: x.totals.length ? Math.max(...x.totals) : null,
          lowest: x.totals.length ? Math.min(...x.totals) : null,
        } as Record<string, ReportCell>,
      }))
      .sort((a, b) => ((b.cells.average as number) ?? 0) - ((a.cells.average as number) ?? 0));
    const all = [...by.values()].flatMap((x) => x.totals);
    const passed = sum([...by.values()].map((x) => x.passed));
    const descriptive = sectionsOf(arms).filter((name) => {
      const id = arms.find((a) => a.section === name)!.sectionId;
      return schemes.get(id)?.mode === 'DESCRIPTIVE';
    });
    const marks = [...passMarks];
    return {
      scope: this.termScope(found, branch, section),
      filters: [this.termFilter(found), sectionFilter(sections, section)],
      metrics: [
        metric('Approved sheets', count(ctxs.length)),
        metric('Student results', count(all.length)),
        metric('Average score', all.length ? `${avg1(all)}%` : '—'),
        metric(
          'Pass rate',
          all.length ? `${pct(passed, all.length)}%` : '—',
          marks.length === 1
            ? `Pass mark ${marks[0]}%`
            : marks.length
              ? 'Each section’s pass mark'
              : undefined,
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
      note: `Approved and published sheets only; absent or missing scores aren’t averaged.${descriptive.length ? ` ${descriptive.join(', ')} use${descriptive.length === 1 ? 's' : ''} descriptive ratings and ${descriptive.length === 1 ? 'is' : 'are'} left out.` : ''}`,
      emptyText: 'No approved result sheets for this term yet.',
    };
  }

  private async grades(q: Q, branch: BranchScope, found: WithTerm): Promise<Built> {
    const [allArms, schemes] = await Promise.all([
      this.results.arms(branch.id),
      this.results.schemes(found.session.id),
    ]);
    const scored = allArms.filter((a) => schemes.get(a.sectionId)?.mode === 'SCORES');
    const sections = sectionsOf(scored);
    const section = sections.includes(q.section ?? '')
      ? q.section!
      : (sections.find((s) => s === 'Junior Secondary') ?? sections[0] ?? '');
    const arms = scored.filter((a) => a.section === section);
    const scheme = arms[0] ? schemes.get(arms[0].sectionId) : undefined;
    const grades = scheme?.scale.map((g) => g.grade) ?? [];
    const pass = scheme?.passMark ?? 0;
    const ctxs = section ? await this.results.approved(found.term, arms) : [];
    const byArm = new Map<
      string,
      { label: string; grades: Record<string, number>; n: number; passed: number }
    >();
    for (const c of ctxs) {
      const row = byArm.get(c.arm.id) ?? {
        label: c.arm.label,
        grades: Object.fromEntries(grades.map((g) => [g, 0])),
        n: 0,
        passed: 0,
      };
      for (const r of c.rows) {
        if (r.total === null || !r.grade) continue;
        row.grades[r.grade] = (row.grades[r.grade] ?? 0) + 1;
        row.n++;
        if (r.total >= pass) row.passed++;
      }
      byArm.set(c.arm.id, row);
    }
    // In the school's class order.
    const ordered = arms.filter((a) => byArm.has(a.id));
    const rows: ReportRow[] = ordered.map((a) => {
      const x = byArm.get(a.id)!;
      return {
        cells: { class: x.label, results: x.n, ...x.grades, passRate: pct(x.passed, x.n) },
        to: { name: ROUTE.classDetail, params: { id: a.id } },
      };
    });
    const list = [...byArm.values()];
    const n = sum(list.map((x) => x.n));
    const passed = sum(list.map((x) => x.passed));
    const top = grades[0];
    return {
      scope: `${found.session.name} · ${found.term.name} · ${branch.name} · ${section || 'No scored section'}`,
      filters: [this.termFilter(found), sectionFilter(sections, section, false)],
      metrics: [
        metric('Graded results', count(n)),
        metric(
          'Pass rate',
          n ? `${pct(passed, n)}%` : '—',
          scheme ? `Pass mark ${pass}%` : undefined,
        ),
        ...(top
          ? [
              metric(
                `Grade ${top}`,
                n ? `${pct(sum(list.map((x) => x.grades[top] ?? 0)), n)}%` : '—',
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
            ...Object.fromEntries(grades.map((g) => [g, sum(list.map((x) => x.grades[g] ?? 0))])),
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

  private async attendanceReport(q: Q, branch: BranchScope, found: WithTerm): Promise<Built> {
    const view = await this.attendance.overview(found.term.id, branch.id ? branch.name : null);
    const sections = [...new Set(view.rows.map((r) => r.section))];
    const section = sections.includes(q.section ?? '') ? q.section! : ALL;
    const rows: ReportRow[] = view.rows
      .filter((r) => section === ALL || r.section === section)
      .map((r) => ({
        cells: {
          class: r.arm,
          ...(branch.id ? {} : { branch: r.branch }),
          classTeacher: r.classTeacher ?? 'No class teacher',
          taken: r.daysTaken,
          notTaken: r.notTaken,
          present: r.present + r.late,
          absent: r.absent,
          excused: r.excused,
          rate: r.rate,
        },
        to: { name: ROUTE.attendanceArm, params: { armId: r.armId } },
      }));
    const n = (k: string) => sum(rows.map((r) => (r.cells[k] as number) ?? 0));
    const marked = n('present') + n('absent') + n('excused');
    const rate = marked ? Math.round((n('present') / marked) * 1000) / 10 : null;
    const missing = rows.filter((r) => (r.cells.notTaken as number) > 0).length;
    return {
      scope: this.termScope(found, branch, section),
      filters: [this.termFilter(found), sectionFilter(sections, section)],
      metrics: [
        metric('Attendance', rate === null ? '—' : `${rate}%`, 'Present or late'),
        metric('School days so far', count(view.schoolDays)),
        metric(
          'Registers not taken',
          count(n('notTaken')),
          missing ? `in ${plural(missing, 'class', 'classes')}` : undefined,
          missing ? 'warning' : undefined,
        ),
      ],
      columns: [
        { key: 'class', label: 'Class' },
        ...(branch.id ? [] : [{ key: 'branch', label: 'Branch' }]),
        { key: 'classTeacher', label: 'Class teacher' },
        { key: 'taken', label: 'Days taken', align: 'right' },
        { key: 'notTaken', label: 'Not taken', align: 'right' },
        { key: 'present', label: 'Present', align: 'right' },
        { key: 'absent', label: 'Absent', align: 'right' },
        { key: 'excused', label: 'Excused', align: 'right' },
        { key: 'rate', label: 'Attendance', align: 'right', percent: true },
      ],
      rows,
      totals: rows.length
        ? {
            class: 'Total',
            ...(branch.id ? {} : { branch: '' }),
            classTeacher: '',
            taken: n('taken'),
            notTaken: n('notTaken'),
            present: n('present'),
            absent: n('absent'),
            excused: n('excused'),
            rate,
          }
        : null,
      note: 'From the class teachers’ daily registers. Present includes late arrivals. Weekends, public holidays, the mid-term break and no-class days are not school days.',
      emptyText: 'No classes in this scope yet.',
    };
  }

  private async enrollment(q: Q, branch: BranchScope, found: Found): Promise<Built> {
    const allArms = await this.results.arms(branch.id);
    const enrolled = await this.db.enrollment.findMany({
      where: {
        sessionId: found.session.id,
        status: ENROLLED,
        student: { status: { in: ON_ROLL }, deletedAt: null },
        ...(branch.id && { branchId: branch.id }),
      },
      select: {
        armId: true,
        level: { select: { section: { select: { name: true } } } },
        student: { select: { gender: true, admittedOn: true } },
      },
    });
    const sections = [
      ...new Set([...sectionsOf(allArms), ...enrolled.map((e) => e.level.section.name)]),
    ];
    const section = sections.includes(q.section ?? '') ? q.section! : ALL;
    const arms = section === ALL ? allArms : allArms.filter((a) => a.section === section);
    const mine = enrolled.filter((e) => section === ALL || e.level.section.name === section);
    const capacities = new Map(
      (
        await this.db.classArm.findMany({
          where: { id: { in: arms.map((a) => a.id) } },
          select: { id: true, capacity: true },
        })
      ).map((a) => [a.id, a.capacity]),
    );
    const start = found.session.startsOn.getTime();
    const isNew = (e: (typeof mine)[number]) => e.student.admittedOn.getTime() >= start;
    const tally = (list: typeof mine) => ({
      male: list.filter((e) => e.student.gender === 'MALE').length,
      female: list.filter((e) => e.student.gender === 'FEMALE').length,
      total: list.length,
      isNew: list.filter(isNew).length,
    });
    const armIds = new Set(arms.map((a) => a.id));
    const rows: ReportRow[] = arms.map((a) => {
      const capacity = capacities.get(a.id) ?? 0;
      const t = tally(mine.filter((e) => e.armId === a.id));
      return {
        cells: {
          class: a.label,
          ...(branch.id ? {} : { branch: a.branch }),
          section: a.section,
          ...t,
          capacity,
          fill: pct(t.total, capacity),
        },
        to: { name: ROUTE.classDetail, params: { id: a.id } },
      };
    });
    // Admitted but not yet placed in an arm (or in one that has since been archived).
    const unplaced = mine.filter((e) => !e.armId || !armIds.has(e.armId));
    if (unplaced.length)
      rows.push({
        cells: {
          class: 'Not placed in a class',
          ...(branch.id ? {} : { branch: '' }),
          section: '',
          ...tally(unplaced),
          capacity: null,
          fill: null,
        },
        to: { name: ROUTE.enrollment },
      });
    const all = tally(mine);
    const capacity = sum([...capacities.values()]);
    const placed = mine.length - unplaced.length;
    return {
      scope: `${found.session.name} · ${branch.name}${section === ALL ? '' : ` · ${section}`}`,
      filters: [sectionFilter(sections, section)],
      metrics: [
        metric('Active students', count(all.total)),
        metric('Girls · boys', `${count(all.female)} · ${count(all.male)}`),
        metric('New this session', count(all.isNew)),
        metric(
          'Places used',
          `${pct(placed, capacity)}%`,
          `${count(placed)} of ${count(capacity)}`,
          placed > capacity ? 'error' : undefined,
        ),
      ],
      columns: [
        { key: 'class', label: 'Class' },
        ...(branch.id ? [] : [{ key: 'branch', label: 'Branch' }]),
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
            ...(branch.id ? {} : { branch: '' }),
            section: '',
            ...all,
            capacity,
            fill: pct(placed, capacity),
          }
        : null,
      note: 'Active and incomplete-profile students enrolled this session. Transferred, withdrawn and graduated students are left out.',
      emptyText: 'No students enrolled yet.',
    };
  }

  private async admissions(q: Q, found: Found | null): Promise<Built> {
    const labels = STAGES.map((s) => STAGE_LABEL[s]);
    const status = labels.includes(q.status ?? '') ? q.status! : ALL;
    const apps = await this.db.admissionApplication.findMany({
      include: { applyingForLevel: { select: { name: true } } },
      orderBy: [{ appliedOn: 'desc' }, { createdAt: 'desc' }],
    });
    const chosen = apps.filter((a) => status === ALL || STAGE_LABEL[a.stage] === status);
    const admitted = apps.filter((a) => a.stage === 'ADMITTED').length;
    const decided = apps.filter((a) => a.stage === 'ADMITTED' || a.stage === 'REJECTED').length;
    const open = apps.filter((a) => a.stage !== 'ADMITTED' && a.stage !== 'REJECTED').length;
    return {
      scope: `${found?.session.name ?? 'All sessions'} · all branches · ${status === ALL ? 'All stages' : status}`,
      filters: [statusFilter(status, labels, 'All stages')],
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
          applicant: studentName(a),
          applyingFor: a.applyingForLevel.name,
          type: ADMISSION_TYPE_LABEL[a.type],
          applied: fmtDate(a.appliedOn),
          guardian: a.guardianName ?? '',
          stage: STAGE_LABEL[a.stage],
        },
        to: a.studentId
          ? { name: ROUTE.student, params: { id: a.studentId } }
          : { name: ROUTE.admissions },
      })),
      totals: null,
      note: 'Applications are school-wide; they’re placed in a branch when admitted.',
      emptyText:
        status === ALL ? 'No applications yet.' : `No applications at the ${status} stage.`,
    };
  }

  private async movements(q: Q, branch: BranchScope): Promise<Built> {
    const labels = MOVES.map((m) => m.label);
    const status = labels.includes(q.status ?? '') ? q.status! : ALL;
    const from = this.date(q.from, 'From');
    const to = this.date(q.to, 'To');
    if (from && to && from > to) throw fail('The start date is after the end date.', 'VALIDATION');
    const students = await this.db.student.findMany({
      where: {
        deletedAt: null,
        status: { in: MOVES.map((m) => m.status) },
        ...(branch.id && { branchId: branch.id }),
      },
      include: {
        enrollments: {
          orderBy: { session: { startsOn: 'desc' } },
          take: 1,
          select: { level: { select: { name: true } }, arm: { select: { name: true } } },
        },
      },
    });
    const moves = students.map((s) => {
      const when = s.exitOn ?? s.graduatedOn ?? s.leftOn;
      const iso = when ? isoDate(when) : '';
      const e = s.enrollments[0];
      return {
        iso,
        type: STATUS_LABEL[s.status],
        row: {
          cells: {
            student: studentName(s),
            from: e ? (e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name) : '—',
            type: STATUS_LABEL[s.status],
            effective: iso ? fmtDate(iso) : '—',
            detail:
              s.status === 'GRADUATED'
                ? 'Completed the final class'
                : [s.exitDestination, s.exitReason].filter(Boolean).join(' · ') || '—',
          },
          to: { name: ROUTE.student, params: { id: s.id } },
        } as ReportRow,
      };
    });
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
      scope: `${branch.name}${range}`,
      filters: [statusFilter(status, labels, 'All movements'), ...dateFilters(from, to)],
      metrics: [
        metric('Transferred', count(n('Transferred'))),
        metric('Withdrawn', count(n('Withdrawn'))),
        metric('Graduated', count(n('Graduated'))),
      ],
      columns: [
        { key: 'student', label: 'Student' },
        { key: 'from', label: 'From class' },
        { key: 'type', label: 'Type' },
        { key: 'effective', label: 'Effective' },
        { key: 'detail', label: 'Destination / reason' },
      ],
      rows: chosen.map((m) => m.row),
      totals: null,
      note: 'Students keep their records and results after they leave.',
      emptyText: 'No students left in this period.',
    };
  }

  /* ---------------- Staff ---------------- */

  private atBranch(branch: BranchScope) {
    return branch.id
      ? { OR: [{ allBranches: true }, { branches: { some: { branchId: branch.id } } }] }
      : {};
  }

  private async staff(branch: BranchScope): Promise<Built> {
    const staff = await this.db.staff.findMany({
      where: { status: 'ACTIVE', ...this.atBranch(branch) },
      select: {
        kind: true,
        employment: true,
        department: { select: { name: true } },
        membership: { select: { status: true } },
      },
    });
    const deptOf = (s: (typeof staff)[number]) => s.department?.name ?? 'No department';
    const depts = [...new Set(staff.map(deptOf))].sort((a, b) =>
      a === 'No department' ? 1 : b === 'No department' ? -1 : a.localeCompare(b),
    );
    const hasAccess = (s: (typeof staff)[number]) =>
      !!s.membership && HOLDS_ACCESS.includes(s.membership.status);
    const rowOf = (list: typeof staff) => ({
      total: list.length,
      teaching: list.filter((s) => s.kind === 'TEACHING').length,
      nonTeaching: list.filter((s) => s.kind !== 'TEACHING').length,
      fullTime: list.filter((s) => s.employment === 'FULL_TIME').length,
      partTime: list.filter((s) => s.employment === 'PART_TIME').length,
      contract: list.filter((s) => s.employment === 'CONTRACT').length,
      access: list.filter(hasAccess).length,
      noAccess: list.filter((s) => !hasAccess(s)).length,
    });
    const rows: ReportRow[] = depts.map((d) => ({
      cells: { department: d, ...rowOf(staff.filter((s) => deptOf(s) === d)) },
      to: { name: ROUTE.staff },
    }));
    const all = rowOf(staff);
    return {
      scope: `${branch.name} · current staff`,
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
      note:
        branch.name === ALL_BRANCHES
          ? 'Every active staff member. Deactivated staff are left out.'
          : 'Staff who work across branches count in each branch they work at. Deactivated staff are left out.',
      emptyText: 'No staff added yet.',
    };
  }

  private async workload(q: Q, branch: BranchScope, found: Found | null): Promise<Built> {
    const status = (LOADS as readonly string[]).includes(q.status ?? '') ? q.status! : ALL;
    const term = found?.term ?? null;
    const [staff, assignments, classTeachers, arms] = await Promise.all([
      this.db.staff.findMany({
        where: { kind: 'TEACHING', status: 'ACTIVE', ...this.atBranch(branch) },
        select: {
          id: true,
          title: true,
          firstName: true,
          lastName: true,
          employment: true,
          maxPeriodsPerWeek: true,
        },
      }),
      term
        ? this.db.teachingAssignment.findMany({
            where: { termId: term.id },
            select: { staffId: true, subjectId: true, armId: true, periodsPerWeek: true },
          })
        : [],
      found
        ? this.db.classTeacherAssignment.findMany({
            where: { sessionId: found.session.id, endsOn: null },
            select: { staffId: true, armId: true },
          })
        : [],
      this.scope.catalog.arms(),
    ]);
    const label = new Map(arms.map((a) => [a.id, a.label]));
    const teachers = staff
      .map((s) => {
        const mine = assignments.filter((a) => a.staffId === s.id);
        const periods = sum(mine.map((a) => a.periodsPerWeek));
        const max = s.maxPeriodsPerWeek;
        const load = !mine.length
          ? 'No assignments'
          : periods > max
            ? 'Over maximum'
            : periods >= max * 0.9
              ? 'Near maximum'
              : 'Within load';
        const classTeacherOf = classTeachers
          .filter((c) => c.staffId === s.id && label.has(c.armId))
          .map((c) => label.get(c.armId)!);
        return {
          id: s.id,
          name: staffName(s),
          load,
          periods,
          cells: {
            teacher: staffName(s),
            employment: EMPLOYMENT_LABEL[s.employment],
            subjects: new Set(mine.map((a) => a.subjectId)).size,
            classes: new Set(mine.map((a) => a.armId)).size,
            periods,
            max,
            used: pct(periods, max),
            classTeacher: classTeacherOf.join(', ') || '—',
            load,
          } as Record<string, ReportCell>,
        };
      })
      .sort((a, b) => b.periods - a.periods || a.name.localeCompare(b.name));
    const chosen = teachers.filter((t) => status === ALL || t.load === status);
    const n = (l: string) => teachers.filter((t) => t.load === l).length;
    return {
      scope: `${branch.name} · ${term ? `${found!.session.name} · ${term.name}` : 'no term yet'}`,
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
        to: { name: ROUTE.staffMember, params: { id: t.id } },
      })),
      totals: null,
      note: 'Periods come from the term’s Teacher Assignments, across every branch the teacher works at.',
      emptyText: teachers.length ? 'No teachers match this status.' : 'No teaching staff yet.',
    };
  }
}
