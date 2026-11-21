import { Injectable } from '@nestjs/common';
import { ENROLLED } from '../shared/enrolled.js';
import { schoolLogoAddress } from '../../auth/auth.presenter.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ConductTrait } from '../../generated/prisma/enums.js';
import { offeredInArm, type ArmInfo } from '../academics/academic-catalog.service.js';
import { fmtDate, isoDate } from '../academics/academic-format.js';
import {
  AttendanceService,
  attendanceRate,
  emptyCounts,
} from '../attendance/attendance.service.js';
import { armRollSpans, covers } from '../shared/arm-roll.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import {
  ResultsCoreService,
  SHEET_INCLUDE,
  stamp,
  type SheetCtx,
  type StudentRef,
  type TermInfo,
} from './results-core.service.js';
import {
  cumulativeAverage,
  gradeOf,
  mean,
  ordinal,
  rankPositions,
  type Scheme,
  type ScoreValue,
} from './scoring.js';

export const CONDUCT_TRAITS = [
  'Punctuality',
  'Neatness',
  'Attentiveness',
  'Relationship with others',
  'Leadership',
] as const;
export type ConductLabel = (typeof CONDUCT_TRAITS)[number];
export const TRAIT: Record<ConductLabel, ConductTrait> = {
  Punctuality: 'PUNCTUALITY',
  Neatness: 'NEATNESS',
  Attentiveness: 'ATTENTIVENESS',
  'Relationship with others': 'RELATIONSHIP_WITH_OTHERS',
  Leadership: 'LEADERSHIP',
};
export const TRAIT_LABEL = Object.fromEntries(
  Object.entries(TRAIT).map(([label, key]) => [key, label]),
) as Record<ConductTrait, ConductLabel>;

const KEY = { PRESENT: 'present', ABSENT: 'absent', LATE: 'late', EXCUSED: 'excused' } as const;

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  schoolDays: number;
  percent: number | null;
}

export interface SubjectResult {
  subjectId: string;
  code: string;
  name: string;
  status: SheetCtx['sheet']['status'] | 'NOT_STARTED';
  scores: ScoreValue[];
  total: number | null;
  grade: string | null;
  remark: string;
  /** The teacher's own comment on the row (Nursery cards print it beside the rating). */
  comment: string;
  /** Position in the arm for the subject (ties share). */
  position: number | null;
  sheetId: string | null;
}

export interface StudentResults {
  student: StudentRef;
  subjects: SubjectResult[];
  average: number | null;
  grade: string | null;
  position: number | null;
}

/** An arm's results for a term: every subject it takes, every student, totals and positions. */
export interface ArmResults {
  term: TermInfo;
  arm: ArmInfo;
  scheme: Scheme | null;
  subjects: { subjectId: string; code: string; name: string; offering: string }[];
  sheets: SheetCtx[];
  students: StudentResults[];
  /** Roll size: the "of N" in positions. */
  classSize: number;
}

type CardRow = Prisma.ReportCardGetPayload<{ include: { conduct: true } }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Report cards: an arm's subject totals, averages and positions (ties share a position and the
 * next is skipped), attendance from the registers, the class teacher's remark and conduct
 * ratings, the next term's start, the school's header, and on the last term of a session the
 * cumulative (annual) averages. School Admin's report card and publishing read from here.
 */
@Injectable()
export class ReportCardsService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly scope: TeacherScopeService,
    private readonly attendance: AttendanceService,
  ) {}

  private get db() {
    return this.core.db;
  }

  /** The subjects an arm takes in a term's session (score-based scheme sections only). */
  async armSubjects(term: TermInfo, arm: ArmInfo) {
    const offered = await this.core.catalog.offeredByLevel(term.sessionId);
    return offeredInArm(offered.get(arm.levelId), arm.id).map((s) => ({
      subjectId: s.subjectId,
      code: s.code,
      name: s.name,
      offering: s.offering as string,
    }));
  }

  async armResults(term: TermInfo, arm: ArmInfo): Promise<ArmResults> {
    const [subjects, schemes, sheets, roll] = await Promise.all([
      this.armSubjects(term, arm),
      this.core.schemes(term.sessionId),
      this.db.resultSheet.findMany({
        where: { termId: term.id, armId: arm.id },
        include: SHEET_INCLUDE,
      }),
      this.db.enrollment.findMany({
        where: { sessionId: term.sessionId, armId: arm.id, status: ENROLLED },
        include: { student: true },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
    ]);
    const scheme = schemes.get(arm.sectionId) ?? null;
    const ctxs = await this.core.contexts(sheets, term);
    const students: StudentRef[] = roll.map((e) => ResultsCoreService.studentRef(e.student));
    for (const c of ctxs)
      for (const s of c.students) if (!students.some((x) => x.id === s.id)) students.push(s);
    const subjectPositions = new Map(
      ctxs.map((c) => [
        c.sheet.id,
        rankPositions(c.rows.map((r) => ({ id: r.studentId, value: r.total }))),
      ]),
    );
    const results: StudentResults[] = students.map((student) => {
      const list: SubjectResult[] = [];
      for (const subj of subjects) {
        const ctx = ctxs.find((c) => c.sheet.subjectId === subj.subjectId);
        const row = ctx?.rows.find((r) => r.studentId === student.id);
        if (ctx && !row) continue; // An elective the student doesn't take.
        if (!ctx && subj.offering !== 'COMPULSORY') continue;
        list.push({
          subjectId: subj.subjectId,
          code: subj.code,
          name: subj.name,
          status: ctx?.sheet.status ?? 'NOT_STARTED',
          scores: row?.scores ?? scheme?.components.map(() => null) ?? [],
          total: row?.total ?? null,
          grade: row?.grade ?? null,
          remark: row?.remark ?? '',
          comment: row?.teacherRemark ?? '',
          position: ctx ? (subjectPositions.get(ctx.sheet.id)?.get(student.id) ?? null) : null,
          sheetId: ctx?.sheet.id ?? null,
        });
      }
      const avg = mean(list.map((s) => s.total).filter((t): t is number => t !== null));
      return {
        student,
        subjects: list,
        average: avg === null ? null : round2(avg),
        grade: avg === null || !scheme ? null : (gradeOf(scheme.scale, avg)?.grade ?? null),
        position: null,
      };
    });
    const positions = rankPositions(results.map((r) => ({ id: r.student.id, value: r.average })));
    for (const r of results) r.position = positions.get(r.student.id) ?? null;
    return {
      term,
      arm,
      scheme,
      subjects,
      sheets: ctxs,
      students: results,
      classSize: roll.length || results.length,
    };
  }

  /** Each student's register summary for the term, for their days in this arm. */
  async attendanceFor(term: TermInfo, armId: string) {
    const [{ days }, spans, registers] = await Promise.all([
      this.attendance.schoolDays(term),
      armRollSpans(this.db, term.sessionId, [armId]),
      this.db.attendanceRegister.findMany({
        where: { termId: term.id, armId },
        include: { marks: { select: { studentId: true, mark: true } } },
      }),
    ]);
    const daySet = new Set(days);
    const out = new Map<string, AttendanceSummary>();
    for (const e of spans) {
      const c = out.get(e.studentId) ?? { ...emptyCounts(), schoolDays: 0, percent: null };
      c.schoolDays += days.filter((d) => covers(e.span, d)).length;
      for (const r of registers) {
        const date = isoDate(r.date);
        if (!daySet.has(date) || !covers(e.span, date)) continue;
        for (const m of r.marks) if (m.studentId === e.studentId) c[KEY[m.mark]]++;
      }
      c.percent = attendanceRate(c);
      out.set(e.studentId, c);
    }
    return { days, byStudent: out };
  }

  static emptyAttendance(): AttendanceSummary {
    return { ...emptyCounts(), schoolDays: 0, percent: null };
  }

  /** The class teacher's remarks and ratings for these students in a term. */
  async remarks(termId: string, studentIds: string[]) {
    const cards = await this.db.reportCard.findMany({
      where: { termId, studentId: { in: studentIds } },
      include: { conduct: true },
    });
    return new Map(cards.map((c) => [c.studentId, c]));
  }

  /** The next term of the session ("Second Term begins 12 Jan 2027") or the end of it. */
  async nextTerm(term: TermInfo) {
    const next = await this.db.term.findFirst({
      where: { sessionId: term.sessionId, sequence: { gt: term.sequence } },
      orderBy: { sequence: 'asc' },
    });
    if (next) return `${next.name} begins ${fmtDate(next.startsOn)}`;
    const after = await this.db.term.findFirst({
      where: { startsOn: { gt: term.endsOn } },
      orderBy: { startsOn: 'asc' },
      include: { session: { select: { name: true } } },
    });
    return after
      ? `End of session · ${after.session.name} ${after.name} begins ${fmtDate(after.startsOn)}`
      : 'End of session';
  }

  async schoolHeader() {
    const school = await this.db.school.findUnique({
      where: { id: ResultsCoreService.schoolId() },
      select: {
        slug: true,
        name: true,
        motto: true,
        street: true,
        city: true,
        state: true,
        email: true,
        brandColor: true,
        logoFileId: true,
        logoFile: { select: { deletedAt: true } },
      },
    });
    if (!school) return { name: '', motto: '', address: '', logoUrl: null, brandColor: null };
    return {
      name: school.name,
      motto: school.motto ?? '',
      address:
        [school.street, school.city, school.state].filter(Boolean).join(', ') +
        (school.email ? ` · ${school.email}` : ''),
      logoUrl: school.logoFileId && !school.logoFile?.deletedAt ? schoolLogoAddress(school) : null,
      brandColor: school.brandColor,
    };
  }

  /**
   * On the last term of a session: every subject's term totals for each term of the session and
   * the cumulative (annual) average, from published results (this term's live totals).
   */
  async cumulative(term: TermInfo, r: StudentResults) {
    const terms = await this.db.term.findMany({
      where: { sessionId: term.sessionId },
      orderBy: { sequence: 'asc' },
    });
    if (terms.length < 2 || terms.at(-1)!.id !== term.id) return null;
    const earlier = terms.slice(0, -1);
    const entries = await this.db.resultEntry.findMany({
      where: {
        studentId: r.student.id,
        sheet: { termId: { in: earlier.map((t) => t.id) }, status: 'PUBLISHED' },
      },
      include: {
        sheet: { select: { termId: true, subject: { select: { id: true, name: true } } } },
      },
    });
    const names = new Map<string, string>();
    for (const s of r.subjects) names.set(s.subjectId, s.name);
    for (const e of entries) names.set(e.sheet.subject.id, e.sheet.subject.name);
    const subjects = [...names]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => {
        const totals = terms.map((t) => {
          if (t.id === term.id) return r.subjects.find((s) => s.subjectId === id)?.total ?? null;
          const e = entries.find((x) => x.sheet.termId === t.id && x.sheet.subject.id === id);
          return e?.total === null || e?.total === undefined ? null : Number(e.total);
        });
        return { name, totals, average: cumulativeAverage(totals) };
      });
    return {
      terms: terms.map((t) => t.name),
      subjects,
      average: cumulativeAverage(subjects.map((s) => s.average)),
    };
  }

  /** Every student's report card in an arm (School Admin's `ReportCard` shape). */
  async cards(term: TermInfo, arm: ArmInfo, only?: string) {
    const results = await this.armResults(term, arm);
    const ids = results.students.map((s) => s.student.id);
    const [att, remarks, header, nextTerm, classTeacher, publication] = await Promise.all([
      this.attendanceFor(term, arm.id),
      this.remarks(term.id, ids),
      this.schoolHeader(),
      this.nextTerm(term),
      this.scope.classTeacherOf(arm.id, term),
      this.db.resultPublication.findFirst({ where: { termId: term.id, armId: arm.id } }),
    ]);
    const holders = await this.core.userNames([...remarks.values()].map((c) => c.heldById));
    const scheme = results.scheme;
    const show = !!scheme?.showPosition;
    const classmates = results.students.map((s) => ({ id: s.student.id, name: s.student.name }));
    const out = new Map<string, Awaited<ReturnType<ReportCardsService['card']>>>();
    for (const r of results.students) {
      if (only && r.student.id !== only) continue;
      out.set(
        r.student.id,
        await this.card({
          results,
          r,
          att: att.days.length
            ? (att.byStudent.get(r.student.id) ?? ReportCardsService.emptyAttendance())
            : null,
          remark: remarks.get(r.student.id) ?? null,
          heldBy: holders,
          header,
          nextTerm,
          classTeacher: classTeacher?.name ?? null,
          published: !!publication,
          show,
          classmates,
        }),
      );
    }
    return { results, cards: out };
  }

  private async card(p: {
    results: ArmResults;
    r: StudentResults;
    att: AttendanceSummary | null;
    remark: CardRow | null;
    heldBy: Map<string, string>;
    header: Awaited<ReturnType<ReportCardsService['schoolHeader']>>;
    nextTerm: string;
    classTeacher: string | null;
    published: boolean;
    show: boolean;
    classmates: { id: string; name: string }[];
  }) {
    const { results, r, remark } = p;
    const { term, arm, scheme } = results;
    const fmt = (v: ScoreValue) => (v === null ? '—' : v);
    const published = p.published && !!remark?.publishedAt;
    // Nursery (descriptive): a rating and comment per learning area; no scores or positions.
    const descriptive = scheme?.mode === 'DESCRIPTIVE';
    return {
      mode: descriptive ? ('descriptive' as const) : ('scores' as const),
      school: p.header,
      title: `${term.name} Report · ${term.session.name}`,
      student: {
        id: r.student.id,
        name: r.student.name,
        admissionNo: r.student.admissionNo,
        gender: r.student.gender,
        className: arm.label,
      },
      classTeacher: p.classTeacher,
      components: descriptive ? [] : (scheme?.components ?? []).map((c) => `${c.name} /${c.max}`),
      subjects: r.subjects.map((s) => ({
        name: s.name,
        scores: descriptive ? [] : s.scores.map(fmt),
        total: descriptive || s.total === null ? '—' : s.total.toFixed(1),
        grade: s.grade ?? '—',
        remark: descriptive
          ? s.comment || s.remark || 'Not rated yet'
          : s.remark || (s.scores.includes('ABS') ? 'Absent' : 'Pending'),
        position:
          p.show && s.position !== null
            ? `${ordinal(s.position)} of ${results.students.filter((x) => x.subjects.some((y) => y.subjectId === s.subjectId)).length}`
            : null,
      })),
      average: r.average === null ? '—' : `${r.average.toFixed(1)}%`,
      grade: r.grade ?? '—',
      position:
        p.show && r.position !== null ? `${ordinal(r.position)} of ${results.classSize}` : null,
      published,
      version: remark?.version ?? 0,
      nextTerm: p.nextTerm,
      classmates: p.classmates,
      classTeacherRemark: remark?.classTeacherRemark ?? null,
      headTeacherRemark: remark?.headTeacherRemark ?? null,
      height: remark?.heightCm != null ? Number(remark.heightCm) : null,
      weight: remark?.weightKg != null ? Number(remark.weightKg) : null,
      conduct: CONDUCT_TRAITS.map((trait) => ({
        trait,
        rating: remark?.conduct.find((c) => c.trait === TRAIT[trait])?.rating ?? null,
      })),
      // Nursery cards leave attendance off (the school's choice); they show height and weight.
      attendance:
        p.att && !descriptive
          ? {
              present: p.att.present + p.att.late,
              late: p.att.late,
              absent: p.att.absent,
              excused: p.att.excused,
              schoolDays: p.att.schoolDays,
            }
          : null,
      held: remark?.heldAt
        ? {
            reason: remark.heldReason ?? '',
            at: stamp(remark.heldAt),
            by: p.heldBy.get(remark.heldById ?? '') ?? 'the academic office',
          }
        : null,
      cumulative: descriptive ? null : await this.cumulative(term, r),
      publishedAt: remark?.publishedAt ? TeacherScopeService.local(remark.publishedAt) : null,
    };
  }
}
