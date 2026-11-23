import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { InvoiceStatus, PaymentMethod, StudentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GROUP_ROLE_LABEL } from '../../platform/groups/groups.service.js';
import { attendanceRate } from '../attendance/attendance.service.js';
import { InsightsResultsService } from '../insights/insights-results.service.js';
import type { SheetCtx } from '../results/results-core.service.js';
import { ON_ROLL } from '../students/student-view.js';
import { asGroupSchool } from './group-context.js';

/** Invoices that count as billed: issued, part-paid or paid (never drafts or cancelled). */
export const BILLED: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'PAID'];
const LEFT: StudentStatus[] = ['TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];
const METHOD: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Period = 'current' | 'previous';
type TermRow = {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  sessionId: string;
  session: { name: string };
};

const naira = (kobo: bigint | null | undefined) => Number(kobo ?? 0n) / 100;
const one = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole ? one((part / whole) * 100) : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const termLabel = (t: TermRow | null) => (t ? `${t.session.name} · ${t.name}` : null);

/** Figures for one school and term, so two terms can be compared. */
interface TermFigures {
  attendance: number | null;
  results: { graded: number; average: number | null; passRate: number | null };
  fees: { billed: number; collected: number; outstanding: number; rate: number | null } | null;
  admitted: number;
  left: number;
}

/**
 * School Admin › Group reports, for a proprietor's group staff: each school of the group side by
 * side for one term (each school's current term, or the one before), with the term before it to
 * compare: results, attendance, fees, enrolment and staff, plus results by subject, the group's
 * top students, fees owed per class and collections per month. Fees are hidden from the group's
 * academic staff. Results are worked out by the results core (approved and published sheets, the
 * same totals and pass marks as the review screens).
 */
@Injectable()
export class GroupReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: InsightsResultsService,
  ) {}

  private async membership(userId: string) {
    const m = await this.prisma.groupStaff.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!m)
      throw AppException.forbidden(
        'Group reports are for the school group’s own staff.',
        'NOT_GROUP_STAFF',
      );
    return m;
  }

  /** The school's current term (the active one, else the latest started) and the terms before. */
  private async terms(schoolId: string, period: Period) {
    const select = {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      sessionId: true,
      session: { select: { name: true } },
    } as const;
    const current =
      (await this.prisma.term.findFirst({ where: { schoolId, status: 'ACTIVE' }, select })) ??
      (await this.prisma.term.findFirst({
        where: { schoolId, startsOn: { lte: new Date() } },
        orderBy: { startsOn: 'desc' },
        select,
      }));
    const before = (t: TermRow | null) =>
      t
        ? this.prisma.term.findFirst({
            where: { schoolId, startsOn: { lt: t.startsOn } },
            orderBy: { startsOn: 'desc' },
            select,
          })
        : Promise.resolve(null);
    const term = period === 'current' ? current : await before(current);
    return { term, compare: await before(term) };
  }

  /** Approved and published scored sheets of the school for the term. */
  private sheets(schoolId: string, term: TermRow): Promise<SheetCtx[]> {
    return asGroupSchool(this.prisma, schoolId, undefined, async () =>
      this.results.approved(term, await this.results.arms(null)),
    );
  }

  private summarise(ctxs: SheetCtx[]) {
    let graded = 0;
    let passed = 0;
    let total = 0;
    for (const c of ctxs)
      for (const r of c.rows) {
        if (r.total === null) continue;
        graded++;
        total += r.total;
        if (r.total >= c.scheme.passMark) passed++;
      }
    return { graded, average: graded ? one(total / graded) : null, passRate: pct(passed, graded) };
  }

  private async figures(
    schoolId: string,
    term: TermRow,
    seesFees: boolean,
    ctxs?: SheetCtx[],
  ): Promise<TermFigures> {
    const window = { gte: term.startsOn, lte: term.endsOn };
    const [marks, sheets, fees, admitted, left] = await Promise.all([
      this.prisma.attendanceEntry.groupBy({
        by: ['mark'],
        where: { schoolId, termId: term.id },
        _count: { _all: true },
      }),
      ctxs ?? this.sheets(schoolId, term),
      seesFees
        ? this.prisma.invoice.aggregate({
            where: { schoolId, termId: term.id, status: { in: BILLED } },
            _sum: { totalKobo: true, paidKobo: true },
          })
        : null,
      this.prisma.student.count({ where: { schoolId, deletedAt: null, admittedOn: window } }),
      this.prisma.student.count({
        where: {
          schoolId,
          deletedAt: null,
          status: { in: LEFT },
          OR: [{ exitOn: window }, { graduatedOn: window }, { leftOn: window }],
        },
      }),
    ]);
    const n = (mark: string) => marks.find((m) => m.mark === mark)?._count._all ?? 0;
    const billed = naira(fees?._sum.totalKobo);
    const collected = naira(fees?._sum.paidKobo);
    return {
      attendance: attendanceRate({
        present: n('PRESENT'),
        late: n('LATE'),
        absent: n('ABSENT'),
        excused: n('EXCUSED'),
      }),
      results: this.summarise(sheets),
      fees: seesFees
        ? {
            billed,
            collected,
            outstanding: Math.max(0, billed - collected),
            rate: pct(collected, billed),
          }
        : null,
      admitted,
      left,
    };
  }

  async report(auth: AuthUserContext, period: Period = 'current') {
    const m = await this.membership(auth.userId);
    const seesFees = m.role !== 'ACADEMIC';
    const schools = await this.prisma.school.findMany({
      where: { groupId: m.groupId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, brandColor: true },
    });

    const subjects = new Map<string, Map<string, { total: number; n: number }>>();
    const students = new Map<
      string,
      {
        studentId: string;
        schoolId: string;
        name: string;
        school: string;
        className: string;
        total: number;
        n: number;
      }
    >();
    const arrears: {
      school: string;
      schoolId: string;
      level: string;
      students: number;
      outstanding: number;
    }[] = [];
    const months = new Map<string, Map<string, number>>();
    const methods = new Map<string, number>();

    const rows = await Promise.all(
      schools.map(async (s) => {
        const { term, compare } = await this.terms(s.id, period);
        const [onRoll, staff, teaching] = await Promise.all([
          this.prisma.student.count({
            where: { schoolId: s.id, status: { in: ON_ROLL }, deletedAt: null },
          }),
          this.prisma.staff.count({ where: { schoolId: s.id, status: 'ACTIVE' } }),
          this.prisma.staff.count({
            where: { schoolId: s.id, status: 'ACTIVE', kind: 'TEACHING' },
          }),
        ]);
        const base = {
          id: s.id,
          name: s.name,
          brandColor: s.brandColor,
          term: termLabel(term),
          compareTerm: termLabel(compare),
          students: { onRoll, admitted: 0, left: 0 },
          staff: { total: staff, teaching, perTeacher: teaching ? one(onRoll / teaching) : null },
        };
        if (!term) return { ...base, now: null, before: null };

        const ctxs = await this.sheets(s.id, term);
        const [now, before] = await Promise.all([
          this.figures(s.id, term, seesFees, ctxs),
          compare ? this.figures(s.id, compare, seesFees) : null,
        ]);

        // Results by subject, and each student's average across their subjects.
        for (const c of ctxs)
          for (const r of c.rows) {
            if (r.total === null) continue;
            const subject = c.sheet.subject.name;
            const bySchool = subjects.get(subject) ?? new Map();
            const cell = bySchool.get(s.id) ?? { total: 0, n: 0 };
            cell.total += r.total;
            cell.n++;
            bySchool.set(s.id, cell);
            subjects.set(subject, bySchool);
            const key = `${s.id}|${r.studentId}`;
            const st = students.get(key) ?? {
              studentId: r.studentId,
              schoolId: s.id,
              name: r.name,
              school: s.name,
              className: c.arm.label,
              total: 0,
              n: 0,
            };
            st.total += r.total;
            st.n++;
            students.set(key, st);
          }

        if (seesFees) {
          const [owed, paid] = await Promise.all([
            this.prisma.invoice.groupBy({
              by: ['levelId'],
              where: {
                schoolId: s.id,
                termId: term.id,
                status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
              },
              _sum: { totalKobo: true, paidKobo: true },
              _count: { _all: true },
            }),
            this.prisma.payment.findMany({
              where: {
                schoolId: s.id,
                status: 'CONFIRMED',
                paidOn: { gte: term.startsOn, lte: term.endsOn },
              },
              select: { paidOn: true, method: true, amountKobo: true },
            }),
          ]);
          const levels = await this.prisma.classLevel.findMany({
            where: { schoolId: s.id, id: { in: owed.map((o) => o.levelId) } },
            select: { id: true, name: true, sortOrder: true },
          });
          for (const lv of levels.sort((a, b) => a.sortOrder - b.sortOrder)) {
            const o = owed.find((x) => x.levelId === lv.id)!;
            const outstanding = naira(o._sum.totalKobo) - naira(o._sum.paidKobo);
            if (outstanding > 0)
              arrears.push({
                school: s.name,
                schoolId: s.id,
                level: lv.name,
                students: o._count._all,
                outstanding,
              });
          }
          for (const p of paid) {
            const ym = iso(p.paidOn).slice(0, 7);
            const bySchool = months.get(ym) ?? new Map<string, number>();
            bySchool.set(s.id, (bySchool.get(s.id) ?? 0) + naira(p.amountKobo));
            months.set(ym, bySchool);
            const label = METHOD[p.method];
            methods.set(label, (methods.get(label) ?? 0) + naira(p.amountKobo));
          }
        }

        return {
          ...base,
          students: { onRoll, admitted: now.admitted, left: now.left },
          now,
          before,
        };
      }),
    );

    const sum = (f: (r: (typeof rows)[number]) => number | null | undefined) =>
      rows.reduce((a, r) => a + (f(r) ?? 0), 0);
    const graded = sum((r) => r.now?.results.graded);
    const weighted = (f: (r: (typeof rows)[number]) => number | null | undefined) =>
      graded ? one(sum((r) => (f(r) ?? 0) * (r.now?.results.graded ?? 0)) / graded) : null;
    const billed = sum((r) => r.now?.fees?.billed);
    const collected = sum((r) => r.now?.fees?.collected);
    const onRoll = sum((r) => r.students.onRoll);
    const teaching = sum((r) => r.staff.teaching);
    // Attendance across the group, weighted by each school's students on roll.
    const attended = rows.filter((r) => r.now?.attendance != null);
    const rollAttended = attended.reduce((a, r) => a + r.students.onRoll, 0);

    return {
      group: { id: m.group.id, name: m.group.name },
      role: GROUP_ROLE_LABEL[m.role],
      period,
      seesFees,
      schools: rows.map(({ now, before, ...r }) => ({
        ...r,
        attendance: { rate: now?.attendance ?? null, before: before?.attendance ?? null },
        results: {
          graded: now?.results.graded ?? 0,
          average: now?.results.average ?? null,
          passRate: now?.results.passRate ?? null,
          averageBefore: before?.results.average ?? null,
          passRateBefore: before?.results.passRate ?? null,
        },
        fees: seesFees
          ? {
              billed: now?.fees?.billed ?? 0,
              collected: now?.fees?.collected ?? 0,
              outstanding: now?.fees?.outstanding ?? 0,
              rate: now?.fees?.rate ?? null,
              rateBefore: before?.fees?.rate ?? null,
              collectedBefore: before?.fees?.collected ?? null,
            }
          : null,
        enrolmentBefore: before ? { admitted: before.admitted, left: before.left } : null,
      })),
      totals: {
        schools: rows.length,
        students: {
          onRoll,
          admitted: sum((r) => r.students.admitted),
          left: sum((r) => r.students.left),
        },
        staff: {
          total: sum((r) => r.staff.total),
          teaching,
          perTeacher: teaching ? one(onRoll / teaching) : null,
        },
        attendance: rollAttended
          ? one(
              attended.reduce((a, r) => a + r.now!.attendance! * r.students.onRoll, 0) /
                rollAttended,
            )
          : null,
        results: {
          graded,
          average: weighted((r) => r.now?.results.average),
          passRate: weighted((r) => r.now?.results.passRate),
        },
        fees: seesFees
          ? {
              billed,
              collected,
              outstanding: sum((r) => r.now?.fees?.outstanding),
              rate: pct(collected, billed),
            }
          : null,
      },
      subjects: [...subjects.entries()]
        .map(([subject, bySchool]) => {
          const all = [...bySchool.values()];
          const n = all.reduce((a, c) => a + c.n, 0);
          return {
            subject,
            schools: Object.fromEntries(
              [...bySchool.entries()].map(([id, c]) => [id, one(c.total / c.n)]),
            ),
            average: one(all.reduce((a, c) => a + c.total, 0) / n),
            results: n,
          };
        })
        .sort((a, b) => a.subject.localeCompare(b.subject)),
      topStudents: [...students.values()]
        .filter((s) => s.n >= 3)
        .map((s) => ({
          studentId: s.studentId,
          schoolId: s.schoolId,
          name: s.name,
          school: s.school,
          className: s.className,
          subjects: s.n,
          average: one(s.total / s.n),
        }))
        .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name))
        .slice(0, 20),
      arrears: seesFees ? arrears.sort((a, b) => b.outstanding - a.outstanding) : null,
      collections: seesFees
        ? [...months.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ym, bySchool]) => ({
              month: `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`,
              schools: Object.fromEntries(bySchool),
              total: [...bySchool.values()].reduce((a, v) => a + v, 0),
            }))
        : null,
      methods: seesFees
        ? [...methods.entries()]
            .map(([method, amount]) => ({ method, amount }))
            .sort((a, b) => b.amount - a.amount)
        : null,
    };
  }

  /** The same report as an Excel workbook, one sheet per part, for a board pack. */
  async workbook(auth: AuthUserContext, period: Period = 'current') {
    const r = await this.report(auth, period);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduTrack';
    const MONEY = '"₦"#,##0.00';
    const add = (
      name: string,
      columns: { header: string; key: string; width?: number; money?: boolean }[],
      data: Record<string, unknown>[],
      total?: Record<string, unknown>,
    ) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? Math.max(12, c.header.length + 2),
        style: c.money ? { numFmt: MONEY } : {},
      }));
      ws.getRow(1).font = { bold: true };
      ws.addRows(data);
      if (total) ws.addRow(total).font = { bold: true };
    };
    const blank = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);

    add(
      'Schools',
      [
        { header: 'School', key: 'school', width: 28 },
        { header: 'Term', key: 'term', width: 26 },
        { header: 'Students on roll', key: 'onRoll' },
        { header: 'Admitted', key: 'admitted' },
        { header: 'Left', key: 'left' },
        { header: 'Staff', key: 'staff' },
        { header: 'Teachers', key: 'teaching' },
        { header: 'Students per teacher', key: 'perTeacher' },
        { header: 'Attendance %', key: 'attendance' },
        { header: 'Attendance % (term before)', key: 'attendanceBefore' },
        { header: 'Graded results', key: 'graded' },
        { header: 'Average score', key: 'average' },
        { header: 'Average (term before)', key: 'averageBefore' },
        { header: 'Pass rate %', key: 'passRate' },
        { header: 'Pass rate % (term before)', key: 'passRateBefore' },
        ...(r.seesFees
          ? [
              { header: 'Billed', key: 'billed', money: true, width: 16 },
              { header: 'Collected', key: 'collected', money: true, width: 16 },
              { header: 'Outstanding', key: 'outstanding', money: true, width: 16 },
              { header: 'Collection %', key: 'rate' },
              { header: 'Collection % (term before)', key: 'rateBefore' },
            ]
          : []),
      ],
      r.schools.map((s) => ({
        school: s.name,
        term: s.term ?? 'No term yet',
        onRoll: s.students.onRoll,
        admitted: s.students.admitted,
        left: s.students.left,
        staff: s.staff.total,
        teaching: s.staff.teaching,
        perTeacher: blank(s.staff.perTeacher),
        attendance: blank(s.attendance.rate),
        attendanceBefore: blank(s.attendance.before),
        graded: s.results.graded,
        average: blank(s.results.average),
        averageBefore: blank(s.results.averageBefore),
        passRate: blank(s.results.passRate),
        passRateBefore: blank(s.results.passRateBefore),
        ...(s.fees && {
          billed: s.fees.billed,
          collected: s.fees.collected,
          outstanding: s.fees.outstanding,
          rate: blank(s.fees.rate),
          rateBefore: blank(s.fees.rateBefore),
        }),
      })),
      {
        school: 'Group total',
        onRoll: r.totals.students.onRoll,
        admitted: r.totals.students.admitted,
        left: r.totals.students.left,
        staff: r.totals.staff.total,
        teaching: r.totals.staff.teaching,
        perTeacher: blank(r.totals.staff.perTeacher),
        attendance: blank(r.totals.attendance),
        graded: r.totals.results.graded,
        average: blank(r.totals.results.average),
        passRate: blank(r.totals.results.passRate),
        ...(r.totals.fees && {
          billed: r.totals.fees.billed,
          collected: r.totals.fees.collected,
          outstanding: r.totals.fees.outstanding,
          rate: blank(r.totals.fees.rate),
        }),
      },
    );
    add(
      'Results by subject',
      [
        { header: 'Subject', key: 'subject', width: 26 },
        ...r.schools.map((s) => ({ header: s.name, key: s.id, width: 20 })),
        { header: 'Group average', key: 'average' },
        { header: 'Results', key: 'results' },
      ],
      r.subjects.map((x) => ({
        subject: x.subject,
        ...x.schools,
        average: x.average,
        results: x.results,
      })),
    );
    add(
      'Top students',
      [
        { header: 'Rank', key: 'rank', width: 8 },
        { header: 'Student', key: 'name', width: 28 },
        { header: 'School', key: 'school', width: 28 },
        { header: 'Class', key: 'className', width: 16 },
        { header: 'Subjects', key: 'subjects' },
        { header: 'Average score', key: 'average' },
      ],
      r.topStudents.map(({ studentId: _s, schoolId: _c, ...s }, i) => ({ rank: i + 1, ...s })),
    );
    if (r.arrears && r.collections && r.methods) {
      add(
        'Fees owed by class',
        [
          { header: 'School', key: 'school', width: 28 },
          { header: 'Class level', key: 'level', width: 18 },
          { header: 'Invoices owing', key: 'students' },
          { header: 'Outstanding', key: 'outstanding', money: true, width: 16 },
        ],
        r.arrears,
      );
      add(
        'Collections by month',
        [
          { header: 'Month', key: 'month', width: 12 },
          ...r.schools.map((s) => ({ header: s.name, key: s.id, money: true, width: 20 })),
          { header: 'Group total', key: 'total', money: true, width: 16 },
        ],
        r.collections.map((c) => ({ month: c.month, ...c.schools, total: c.total })),
      );
      add(
        'Payment methods',
        [
          { header: 'Method', key: 'method', width: 18 },
          { header: 'Amount', key: 'amount', money: true, width: 16 },
        ],
        r.methods,
      );
    }
    const name = `${r.group.name} group report ${period === 'current' ? 'this term' : 'last term'}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName: `${name}.xlsx` };
  }
}
