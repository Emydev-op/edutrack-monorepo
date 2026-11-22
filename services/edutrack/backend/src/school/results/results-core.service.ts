import { HttpStatus, Injectable } from '@nestjs/common';
import { ENROLLED } from '../shared/enrolled.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ScoreState, SheetAction, SheetStatus } from '../../generated/prisma/enums.js';
import {
  AcademicCatalogService,
  type ArmInfo,
  offeredInArm,
} from '../academics/academic-catalog.service.js';
import { fmtDate, staffName } from '../academics/academic-format.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import {
  completionOf,
  gradeOf,
  ratingComponent,
  scoreRow,
  statsOf,
  totalOf,
  type Scheme,
  type ScoreValue,
} from './scoring.js';

export const STATUS_LABEL: Record<SheetStatus, string> = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  RETURNED: 'Returned',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
};
export const SHEET_STATUSES = Object.values(STATUS_LABEL);

const CORRECTION_LABEL = {
  UNDER_REVIEW: 'Under review',
  APPLIED: 'Applied',
  REJECTED: 'Rejected',
} as const;

const STATE_VALUE: Record<ScoreState, 'ABS' | 'EXM' | null> = {
  SCORED: null,
  ABSENT: 'ABS',
  EXEMPT: 'EXM',
};

const person = { select: { id: true, title: true, firstName: true, lastName: true } } as const;

export const SHEET_INCLUDE = {
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      department: { select: { id: true, name: true, hodStaffId: true, hod: person } },
    },
  },
  teacher: person,
  reviewer: person,
  curriculumEntry: { select: { offering: true } },
} satisfies Prisma.ResultSheetInclude;

export type SheetRecord = Prisma.ResultSheetGetPayload<{ include: typeof SHEET_INCLUDE }>;

export interface TermInfo {
  id: string;
  name: string;
  sequence: number;
  sessionId: string;
  status: string;
  startsOn: Date;
  endsOn: Date;
  resultEntryClosesAt: Date | null;
  session: { name: string };
}

export interface StudentRef {
  id: string;
  name: string;
  admissionNo: string;
  gender: string;
}

export interface EntryRecord {
  id: string;
  studentId: string;
  teacherRemark: string | null;
  position: number | null;
  /** Descriptive schemes: the rating given. */
  ratingId?: string | null;
  scores: { componentId: string; state: ScoreState; score: Prisma.Decimal | null }[];
}

export interface RowView {
  studentId: string;
  name: string;
  admissionNo: string;
  scores: ScoreValue[];
  total: number | null;
  grade: string | null;
  remark: string;
  flag: string;
  teacherRemark: string;
}

/** A sheet with everything its views need. */
export interface SheetCtx {
  sheet: SheetRecord;
  term: TermInfo;
  arm: ArmInfo;
  scheme: Scheme;
  /** The section's short code (JSS, SSS…). */
  sectionCode: string;
  students: StudentRef[];
  entries: Map<string, EntryRecord>;
  rows: RowView[];
  /** Staff ids of everyone who may enter scores: the lead and co-teachers. */
  teacherIds: string[];
}

const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female' };

/** "8 Dec, 08:15" in Lagos time. */
export const stamp = (d: Date) => {
  const local = TeacherScopeService.local(d);
  return `${fmtDate(local.slice(0, 10), false)}, ${local.slice(11, 16)}`;
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Fri 11 Dec at 23:59" in Lagos time. */
export const deadlineText = (d: Date) => {
  const local = TeacherScopeService.local(d);
  const day = local.slice(0, 10);
  return `${DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${fmtDate(day, false)} at ${local.slice(11, 16)}`;
};

export const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);

/**
 * What every results service shares: terms and assessment schemes, finding and creating sheets,
 * loading a sheet's students and scores, the review chain, locks, history, notifications, and
 * the sheet views both portals print (shapes follow the Teacher Workspace and School Admin mocks).
 */
@Injectable()
export class ResultsCoreService {
  constructor(
    readonly catalog: AcademicCatalogService,
    readonly clock: Clock,
  ) {}

  get db() {
    return this.catalog.db;
  }

  now() {
    return this.clock.now();
  }

  static schoolId() {
    return RequestContext.get()!.schoolId!;
  }

  /* ---------------- Terms and schemes ---------------- */

  async term(termId: string): Promise<TermInfo> {
    const t = await this.db.term.findFirst({
      where: { id: termId },
      include: { session: { select: { name: true } } },
    });
    if (!t) throw AppException.notFound('That term doesn’t exist.', 'NOT_FOUND');
    return t;
  }

  /** The School Admin's working term (`?term=` of the current session), else the current one. */
  async adminTerm(termId?: string | null): Promise<TermInfo> {
    const found = await this.catalog.termFrom(termId);
    if (!found?.term) throw conflict('Create a session and its terms first.', 'NO_TERM');
    return this.term(found.term.id);
  }

  /** sectionId → the session's assessment scheme. */
  async schemes(sessionId: string): Promise<Map<string, Scheme>> {
    const [rows, settings] = await Promise.all([
      this.db.assessmentScheme.findMany({
        where: { sessionId },
        include: {
          components: { orderBy: { sortOrder: 'asc' } },
          gradeBands: { orderBy: { sortOrder: 'asc' } },
          ratings: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      this.db.schoolSettings.findFirst({ select: { reweightExempt: true } }),
    ]);
    const reweightExempt = settings?.reweightExempt ?? true;
    return new Map(
      rows.map((s) => [
        s.sectionId,
        {
          id: s.id,
          sessionId: s.sessionId,
          sectionId: s.sectionId,
          mode: s.mode,
          // Descriptive (Nursery): one Rating column instead of score components.
          components:
            s.mode === 'DESCRIPTIVE'
              ? [ratingComponent(s.ratings.length)]
              : s.components.map((c) => ({
                  id: c.id,
                  key: c.key,
                  name: c.name,
                  max: Number(c.maxScore),
                  weight: Number(c.weight),
                  when: c.typicalWhen,
                })),
          ratings: s.ratings.map((r) => ({ id: r.id, name: r.name, description: r.description })),
          scale: s.gradeBands.map((g) => ({
            grade: g.grade,
            min: Number(g.minScore),
            max: Number(g.maxScore),
            remark: g.remark,
            points: Number(g.points),
            pass: g.isPass,
          })),
          scaleName: s.scaleName || (s.gradeBands.length ? 'Grading scale' : ''),
          passMark: Number(s.passMark),
          rounding: s.rounding,
          showPosition: s.showPosition,
          lockedAt: s.lockedAt,
          reweightExempt,
        },
      ]),
    );
  }

  async sectionCodes() {
    const sections = await this.catalog.structure.sections();
    return new Map(sections.map((s) => [s.id, s.code]));
  }

  /* ---------------- Sheets ---------------- */

  async sheetById(id: string): Promise<SheetRecord> {
    const sheet = await this.db.resultSheet.findFirst({ where: { id }, include: SHEET_INCLUDE });
    if (!sheet) throw AppException.notFound('That sheet wasn’t found.', 'NOT_FOUND');
    return sheet;
  }

  /**
   * The sheets for these arm × subject pairs in a term, created when missing: one per term × arm ×
   * subject, owned by the subject's lead teacher. Pairs the arm doesn't take, or whose section has
   * no score-based scheme, are skipped. An unpublished sheet follows the current lead teacher.
   */
  async ensureSheets(term: TermInfo, pairs: { armId: string; subjectId: string }[]) {
    if (!pairs.length) return [];
    const [arms, offered, schemes, leads, existing, classTeachers] = await Promise.all([
      this.catalog.arms(),
      this.catalog.offeredByLevel(term.sessionId),
      this.schemes(term.sessionId),
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, lead: true, armId: { in: pairs.map((p) => p.armId) } },
      }),
      this.db.resultSheet.findMany({
        where: { termId: term.id, armId: { in: pairs.map((p) => p.armId) } },
      }),
      this.classTeachers(
        term.sessionId,
        pairs.map((p) => p.armId),
      ),
    ]);
    const armById = new Map(arms.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const p of pairs) {
      const key = `${p.armId}|${p.subjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const arm = armById.get(p.armId);
      if (!arm) continue;
      const scheme = schemes.get(arm.sectionId);
      if (!scheme) continue;
      if (!offeredInArm(offered.get(arm.levelId), arm.id).some((s) => s.subjectId === p.subjectId))
        continue;
      // Nursery (descriptive): the class teacher rates every learning area of the class.
      const descriptive = scheme.mode === 'DESCRIPTIVE';
      const classTeacher = descriptive ? (classTeachers.get(p.armId) ?? null) : null;
      const lead = descriptive
        ? null
        : (leads.find((l) => l.armId === p.armId && l.subjectId === p.subjectId) ?? null);
      const owner = descriptive ? classTeacher : (lead?.staffId ?? null);
      const found = existing.find((s) => s.armId === p.armId && s.subjectId === p.subjectId);
      if (found) {
        ids.push(found.id);
        const follows = found.status !== 'PUBLISHED' && found.status !== 'APPROVED';
        if (follows && lead && found.teachingAssignmentId !== lead.id)
          await this.db.resultSheet.update({
            where: { id: found.id },
            data: { teachingAssignmentId: lead.id, teacherStaffId: lead.staffId },
          });
        else if (follows && descriptive && classTeacher && found.teacherStaffId !== classTeacher)
          await this.db.resultSheet.update({
            where: { id: found.id },
            data: { teachingAssignmentId: null, teacherStaffId: classTeacher },
          });
        continue;
      }
      const created = await this.db.resultSheet
        .create({
          data: {
            schoolId: ResultsCoreService.schoolId(),
            sessionId: term.sessionId,
            termId: term.id,
            levelId: arm.levelId,
            armId: arm.id,
            subjectId: p.subjectId,
            schemeId: scheme.id,
            teachingAssignmentId: lead?.id ?? null,
            teacherStaffId: owner,
          },
        })
        // Two requests creating the same sheet at once: the other one won.
        .catch(() =>
          this.db.resultSheet.findFirstOrThrow({
            where: { termId: term.id, armId: arm.id, subjectId: p.subjectId },
          }),
        );
      ids.push(created.id);
    }
    if (!ids.length) return [];
    return this.db.resultSheet.findMany({ where: { id: { in: ids } }, include: SHEET_INCLUDE });
  }

  /** armId → its class teacher's staff id this session (current assignment). */
  async classTeachers(sessionId: string, armIds: string[]): Promise<Map<string, string>> {
    const rows = await this.db.classTeacherAssignment.findMany({
      where: { sessionId, armId: { in: armIds }, endsOn: null },
      orderBy: { startsOn: 'desc' },
      select: { armId: true, staffId: true },
    });
    const out = new Map<string, string>();
    for (const r of rows) if (!out.has(r.armId)) out.set(r.armId, r.staffId);
    return out;
  }

  /* ---------------- Loading ---------------- */

  /** Sheets of one term with their students, scores and rows. */
  async contexts(sheets: SheetRecord[], term?: TermInfo): Promise<SheetCtx[]> {
    if (!sheets.length) return [];
    const t = term ?? (await this.term(sheets[0]!.termId));
    const armIds = [...new Set(sheets.map((s) => s.armId))];
    const [arms, schemes, codes, roll, entries, assignments, classTeachers] = await Promise.all([
      this.catalog.arms(),
      this.schemes(t.sessionId),
      this.sectionCodes(),
      this.db.enrollment.findMany({
        where: { sessionId: t.sessionId, armId: { in: armIds }, status: ENROLLED },
        include: { student: true },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
      this.db.resultEntry.findMany({
        where: { sheetId: { in: sheets.map((s) => s.id) } },
        include: {
          scores: { select: { componentId: true, state: true, score: true } },
          student: true,
        },
      }),
      this.db.teachingAssignment.findMany({
        where: { termId: t.id, armId: { in: armIds } },
        select: { armId: true, subjectId: true, staffId: true, lead: true },
      }),
      this.classTeachers(t.sessionId, armIds),
    ]);
    const electives = sheets.some((s) => s.curriculumEntry.offering !== 'COMPULSORY')
      ? await this.db.studentSubject.findMany({
          where: { sessionId: t.sessionId, studentId: { in: roll.map((e) => e.studentId) } },
          select: { studentId: true, subjectId: true },
        })
      : [];
    const armById = new Map(arms.map((a) => [a.id, a]));
    const out: SheetCtx[] = [];
    for (const sheet of sheets) {
      const arm = armById.get(sheet.armId);
      const scheme = [...schemes.values()].find((x) => x.id === sheet.schemeId);
      if (!arm || !scheme) continue;
      let onRoll = roll.filter((e) => e.armId === sheet.armId);
      if (sheet.curriculumEntry.offering !== 'COMPULSORY') {
        const classChoices = electives.filter((c) =>
          onRoll.some((e) => e.studentId === c.studentId),
        );
        if (classChoices.length) {
          const takes = new Set(
            classChoices.filter((c) => c.subjectId === sheet.subjectId).map((c) => c.studentId),
          );
          onRoll = onRoll.filter((e) => takes.has(e.studentId));
        }
      }
      const mine = entries.filter((e) => e.sheetId === sheet.id);
      const students: StudentRef[] = onRoll.map((e) => ResultsCoreService.studentRef(e.student));
      // Anyone with scores who has since left the class stays on the sheet.
      const extra = mine
        .filter((e) => !students.some((s) => s.id === e.studentId))
        .map((e) => ResultsCoreService.studentRef(e.student))
        .sort((a, b) => a.name.localeCompare(b.name));
      const all = [...students, ...extra];
      const byStudent = new Map<string, EntryRecord>(mine.map((e) => [e.studentId, e]));
      out.push({
        sheet,
        term: t,
        arm,
        scheme,
        sectionCode: codes.get(arm.sectionId) ?? '',
        students: all,
        entries: byStudent,
        rows: all.map((s) => ResultsCoreService.row(scheme, s, byStudent.get(s.id))),
        teacherIds:
          scheme.mode === 'DESCRIPTIVE'
            ? [classTeachers.get(sheet.armId)].filter((x): x is string => !!x)
            : assignments
                .filter((a) => a.armId === sheet.armId && a.subjectId === sheet.subjectId)
                .sort((a, b) => Number(b.lead) - Number(a.lead))
                .map((a) => a.staffId),
      });
    }
    return out;
  }

  async context(sheet: SheetRecord, term?: TermInfo) {
    const [ctx] = await this.contexts([sheet], term);
    if (!ctx)
      throw conflict(
        'This sheet’s class or assessment scheme is no longer set up.',
        'SHEET_UNAVAILABLE',
      );
    return ctx;
  }

  static studentRef(s: {
    id: string;
    firstName: string;
    surname: string;
    admissionNo: string;
    gender: string;
  }): StudentRef {
    return {
      id: s.id,
      name: `${s.firstName} ${s.surname}`.trim(),
      admissionNo: s.admissionNo,
      gender: GENDER[s.gender] ?? 'Male',
    };
  }

  static valuesOf(scheme: Scheme, entry: EntryRecord | undefined): ScoreValue[] {
    if (scheme.mode === 'DESCRIPTIVE') {
      const i = scheme.ratings.findIndex((r) => r.id === entry?.ratingId);
      return [i >= 0 ? i + 1 : null];
    }
    return scheme.components.map((c) => {
      const s = entry?.scores.find((x) => x.componentId === c.id);
      if (!s) return null;
      return s.state === 'SCORED' ? Number(s.score) : STATE_VALUE[s.state];
    });
  }

  static row(scheme: Scheme, s: StudentRef, entry: EntryRecord | undefined): RowView {
    return {
      studentId: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      ...scoreRow(scheme, ResultsCoreService.valuesOf(scheme, entry)),
      teacherRemark: entry?.teacherRemark ?? '',
    };
  }

  /* ---------------- Review chain ---------------- */

  static hodLabel(
    ctx: SheetCtx,
    staff: { title: string | null; firstName: string; lastName: string },
  ) {
    const dept = ctx.sheet.subject.department;
    return `${staffName(staff)}${dept ? ` (HOD ${dept.name})` : ''}`;
  }

  /** Where a submit goes now: the department's HOD, or the academic office (null). */
  static nextReviewer(ctx: SheetCtx): string | null {
    const s = ctx.sheet;
    if (s.status === 'RETURNED') return s.returnedBy === 'HOD' ? s.reviewerStaffId : null;
    const hod = s.subject.department?.hodStaffId ?? null;
    return hod && hod !== s.teacherStaffId ? hod : null;
  }

  async submitTo(ctx: SheetCtx) {
    const s = ctx.sheet;
    const hodId = ResultsCoreService.nextReviewer(ctx);
    const dept = s.subject.department;
    if (hodId) {
      const hod =
        hodId === dept?.hodStaffId && dept.hod
          ? dept.hod
          : hodId === s.reviewerStaffId && s.reviewer
            ? s.reviewer
            : await this.db.staff.findFirst({ where: { id: hodId }, ...person });
      if (hod) return { hodId, label: ResultsCoreService.hodLabel(ctx, hod) };
    }
    let label = 'the academic office';
    if (s.status === 'RETURNED' && s.returnedBy === 'OFFICE') label = 'the academic office';
    else if (dept && !dept.hodStaffId) label = `the academic office (${dept.name} has no HOD)`;
    else if (dept && dept.hodStaffId === s.teacherStaffId)
      label = `the academic office (your own ${dept.name} sheet skips the HOD step)`;
    return { hodId: null, label };
  }

  static withHod(s: { status: SheetStatus; reviewerStaffId: string | null }) {
    return s.status === 'SUBMITTED' && s.reviewerStaffId !== null;
  }

  /** With the academic office: Under review, or Submitted with no HOD in the chain. */
  static withOffice(s: { status: SheetStatus; reviewerStaffId: string | null }) {
    return s.status === 'UNDER_REVIEW' || (s.status === 'SUBMITTED' && s.reviewerStaffId === null);
  }

  static withLabel(ctx: SheetCtx) {
    const s = ctx.sheet;
    if (ResultsCoreService.withHod(s) && s.reviewer)
      return `With ${ResultsCoreService.hodLabel(ctx, s.reviewer)}`;
    if (s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW') return 'With the academic office';
    return null;
  }

  /* ---------------- Locks ---------------- */

  /** Result entry has closed for the term (and wasn't reopened for this sheet). */
  entryClosed(term: TermInfo, sheet?: { entryReopenedUntil: Date | null }) {
    const now = this.now();
    if (sheet?.entryReopenedUntil && sheet.entryReopenedUntil > now) return false;
    return !!term.resultEntryClosesAt && now > term.resultEntryClosesAt;
  }

  /** When entry closes for this sheet: the reopened window, else the term's deadline. */
  deadline(ctx: SheetCtx) {
    const reopened = ctx.sheet.entryReopenedUntil;
    const closes = ctx.term.resultEntryClosesAt;
    if (reopened && reopened > this.now() && (!closes || reopened > closes)) return reopened;
    return closes;
  }

  /** Why the sheet can't be edited now (term → status → deadline), or null. */
  lock(ctx: SheetCtx) {
    const { term, sheet } = ctx;
    const reason = TeacherScopeService.lockReason(term);
    if (reason) return { code: 'TERM_LOCKED' as const, title: 'Read-only term', reason };
    switch (sheet.status) {
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return {
          code: 'SHEET_LOCKED' as const,
          title: ResultsCoreService.withLabel(ctx) ?? 'Submitted',
          reason: `Submitted ${sheet.submittedAt ? stamp(sheet.submittedAt) : ''}. It’s locked while it’s reviewed; you can edit it again only if it’s returned to you.`,
        };
      case 'APPROVED':
        return {
          code: 'SHEET_LOCKED' as const,
          title: 'Approved',
          reason:
            'The academic office approved this sheet. It’s locked until results are published.',
        };
      case 'PUBLISHED':
        return {
          code: 'SHEET_LOCKED' as const,
          title: 'Published',
          reason:
            'These results are published to students and guardians. To change a score, request a correction.',
        };
    }
    if (term.resultEntryClosesAt && this.entryClosed(term, sheet))
      return {
        code: 'TERM_LOCKED' as const,
        title: 'Result entry closed',
        reason: `Result entry closed on ${deadlineText(term.resultEntryClosesAt)}. Ask the academic office to reopen it.`,
      };
    return null;
  }

  requireEditable(ctx: SheetCtx) {
    const lock = this.lock(ctx);
    if (lock) throw conflict(lock.reason, lock.code);
  }

  /* ---------------- History, events and notifications ---------------- */

  async event(
    tx: TenantTx,
    sheet: { id: string; status: SheetStatus },
    action: SheetAction,
    toStatus: SheetStatus,
    actor: { userId: string; staffId?: string | null },
    note?: string | null,
  ) {
    await tx.resultSheetEvent.create({
      data: {
        schoolId: ResultsCoreService.schoolId(),
        sheetId: sheet.id,
        action,
        fromStatus: sheet.status,
        toStatus,
        actorUserId: actor.userId,
        actorStaffId: actor.staffId ?? null,
        note: note ?? null,
        createdAt: this.now(),
      },
    });
  }

  /** In-app notifications to staff (through their active accounts). */
  async notifyStaff(
    tx: TenantTx,
    staffIds: (string | null | undefined)[],
    n: { category: string; title: string; body: string; link: string; sheetId?: string },
  ) {
    const ids = [...new Set(staffIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    const members = await tx.schoolMembership.findMany({
      where: { staffId: { in: ids }, status: 'ACTIVE' },
      select: { userId: true },
    });
    const schoolId = ResultsCoreService.schoolId();
    for (const userId of new Set(members.map((m) => m.userId)))
      await tx.notification.create({
        data: {
          userId,
          schoolId,
          category: n.category,
          title: n.title,
          body: n.body,
          link: n.link,
          entityType: n.sheetId ? 'ResultSheet' : null,
          entityId: n.sheetId ?? null,
          createdAt: this.now(),
        },
      });
  }

  /** Names of these users ("Adaeze Okonkwo"), by id. */
  async userNames(ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map<string, string>();
    const users = await this.db.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, title: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, staffName(u)]));
  }

  /** The sheet's timeline, newest first. */
  async history(ctx: SheetCtx) {
    const events = await this.db.resultSheetEvent.findMany({
      where: { sheetId: ctx.sheet.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const staff = await this.db.staff.findMany({
      where: {
        id: { in: [...new Set(events.map((e) => e.actorStaffId).filter((x) => !!x))] as string[] },
      },
      ...person,
    });
    const users = await this.userNames(
      events.filter((e) => !e.actorStaffId).map((e) => e.actorUserId),
    );
    const nameOf = (e: (typeof events)[number]) => {
      const s = staff.find((x) => x.id === e.actorStaffId);
      return s ? staffName(s) : (users.get(e.actorUserId ?? '') ?? 'the academic office');
    };
    const dept = ctx.sheet.subject.department?.name;
    return events.map((e) => {
      const who = nameOf(e);
      const base = { id: e.id, when: stamp(e.createdAt) };
      switch (e.action) {
        case 'SAVED':
          return { ...base, title: 'Draft started', detail: `By ${who}`, tone: 'neutral' as const };
        case 'SUBMITTED':
          return {
            ...base,
            title: `${e.fromStatus === 'RETURNED' ? 'Resubmitted' : 'Submitted'} by ${who} to ${e.note ?? 'the academic office'}`,
            tone: 'info' as const,
          };
        case 'RECALLED':
          return {
            ...base,
            title: `Recalled by ${who}`,
            detail: 'Back to draft',
            tone: 'warning' as const,
          };
        case 'FORWARDED':
          return {
            ...base,
            title: `Forwarded by HOD ${who}`,
            detail: `${dept ? `${dept} · ` : ''}sent to the academic office`,
            tone: 'info' as const,
          };
        case 'RETURNED':
          return {
            ...base,
            // A return from Submitted is the HOD's; from Under review, the office's.
            title: e.fromStatus === 'SUBMITTED' ? `Returned by HOD ${who}` : `Returned by ${who}`,
            detail: e.note ?? undefined,
            tone: 'error' as const,
          };
        case 'APPROVED':
          return { ...base, title: `Approved by ${who}`, tone: 'success' as const };
        case 'PUBLISHED':
          return {
            ...base,
            title: 'Published',
            detail: 'Results released to students and guardians',
            tone: 'success' as const,
          };
        case 'REOPENED':
          return {
            ...base,
            title: `Result entry reopened by ${who}`,
            detail: e.note ?? undefined,
            tone: 'info' as const,
          };
        case 'CORRECTION_APPLIED':
          return {
            ...base,
            title: `Correction applied by ${who}`,
            detail: e.note ?? undefined,
            tone: 'success' as const,
          };
      }
    });
  }

  /* ---------------- Views ---------------- */

  /** One row of a teacher's results list. */
  summary(ctx: SheetCtx) {
    const { sheet, arm, scheme } = ctx;
    const lock = this.lock(ctx);
    const deadline = this.deadline(ctx);
    return {
      id: sheet.id,
      termId: sheet.termId,
      armId: arm.id,
      arm: arm.label,
      subject: sheet.subject.code,
      subjectName: sheet.subject.name,
      branchName: arm.branch,
      students: ctx.rows.length,
      status: STATUS_LABEL[sheet.status],
      withHod: ResultsCoreService.withHod(sheet),
      withLabel: ResultsCoreService.withLabel(ctx),
      completion: completionOf(scheme.components.length, ctx.rows),
      average: statsOf(scheme, ctx.rows).average,
      deadline: deadline ? TeacherScopeService.local(deadline) : null,
      savedAt: sheet.savedAt ? TeacherScopeService.local(sheet.savedAt) : null,
      submittedAt: sheet.submittedAt ? TeacherScopeService.local(sheet.submittedAt) : null,
      editable: lock === null,
      returnNote: sheet.status === 'RETURNED' ? sheet.returnNote : null,
    };
  }

  static components(scheme: Scheme) {
    return scheme.components.map((c) => ({
      key: c.key,
      name: c.name,
      max: c.max,
      weight: c.weight,
      when: c.when,
    }));
  }

  /** Can the teacher take this submitted sheet back? Only until the HOD or the office acts. */
  static canRecall(ctx: SheetCtx) {
    const s = ctx.sheet;
    if (ctx.term.status !== 'ACTIVE') return false;
    return s.status === 'SUBMITTED' || (s.status === 'UNDER_REVIEW' && !s.forwardedAt);
  }

  /** The Teacher Workspace's sheet (`ResultSheet`), seen by `viewerStaffId`. */
  async teacherView(ctx: SheetCtx, viewerStaffId: string | null) {
    const { sheet, scheme } = ctx;
    const [target, history, corrections] = await Promise.all([
      this.submitTo(ctx),
      this.history(ctx),
      this.db.scoreCorrection.findMany({
        where: { sheetId: sheet.id },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        include: { evidenceFile: { select: { originalName: true } } },
      }),
    ]);
    const lock = this.lock(ctx);
    const dept = sheet.subject.department;
    const isLead = !!viewerStaffId && viewerStaffId === sheet.teacherStaffId;
    let returned: { by: string; at: string; note: string } | null = null;
    if (sheet.status === 'RETURNED' && sheet.returnedAt)
      returned = {
        by:
          sheet.returnedBy === 'HOD' && sheet.reviewer
            ? ResultsCoreService.hodLabel(ctx, sheet.reviewer)
            : 'the academic office',
        at: TeacherScopeService.local(sheet.returnedAt),
        note: sheet.returnNote ?? '',
      };
    return {
      ...this.summary(ctx),
      teacherId: sheet.teacherStaffId ?? '',
      teacher: sheet.teacher ? staffName(sheet.teacher) : 'No teacher assigned',
      section: ctx.sectionCode,
      department: dept?.name ?? null,
      submitTo: returned ? returned.by : target.label,
      submitToHod: target.hodId !== null,
      components: ResultsCoreService.components(scheme),
      // Nursery (descriptive): one Rating column; a row's scores[0] is its place on this scale.
      mode: scheme.mode === 'DESCRIPTIVE' ? ('descriptive' as const) : ('scores' as const),
      ratings: scheme.ratings,
      scale: scheme.scale,
      scaleName: scheme.scaleName,
      passMark: scheme.passMark,
      rows: ctx.rows,
      stats: statsOf(scheme, ctx.rows),
      lock,
      returned,
      canRequestCorrection:
        scheme.mode === 'SCORES' &&
        sheet.status === 'PUBLISHED' &&
        !!viewerStaffId &&
        ctx.teacherIds.includes(viewerStaffId),
      corrections: await this.correctionViews(ctx, corrections),
      history,
      // Phase 3b additions: co-teachers enter scores, only the lead submits or recalls.
      isLead,
      lead: sheet.teacher ? staffName(sheet.teacher) : null,
      canRecall: isLead && ResultsCoreService.canRecall(ctx),
      revision: sheet.revision,
    };
  }

  /** School Admin's sheet (`ResultSheet` in school-admin/src/types/academics.ts). */
  async adminView(ctx: SheetCtx) {
    const { sheet, scheme, term } = ctx;
    const stats = statsOf(scheme, ctx.rows);
    const dept = sheet.subject.department;
    const hod =
      dept?.hod && dept.hodStaffId !== sheet.teacherStaffId
        ? ResultsCoreService.hodLabel(ctx, dept.hod)
        : null;
    const deadline = this.deadline(ctx);
    return {
      armId: ctx.arm.id,
      arm: ctx.arm.label,
      subject: sheet.subject.code,
      subjectName: sheet.subject.name,
      teacher: sheet.teacher ? staffName(sheet.teacher) : null,
      term: term.name,
      status: STATUS_LABEL[sheet.status],
      submittedAt: sheet.submittedAt ? stamp(sheet.submittedAt) : null,
      components: ResultsCoreService.components(scheme),
      mode: scheme.mode === 'DESCRIPTIVE' ? ('descriptive' as const) : ('scores' as const),
      ratings: scheme.ratings,
      // Nursery sheets keep the teacher's comment (it's the card's comment per learning area).
      rows: ctx.rows.map(({ teacherRemark, ...r }) =>
        scheme.mode === 'DESCRIPTIVE' ? { ...r, teacherRemark } : r,
      ),
      stats: {
        average: stats.average,
        highest: stats.highest,
        lowest: stats.lowest,
        passed: stats.passed,
        count: stats.count,
        absent: stats.absent,
        exempt: stats.exempt,
        missing: stats.missing,
      },
      returnNote: sheet.status === 'RETURNED' ? (sheet.returnNote ?? '') : '',
      returnedBy:
        sheet.status !== 'RETURNED'
          ? null
          : sheet.returnedBy === 'HOD'
            ? sheet.reviewer
              ? ResultsCoreService.hodLabel(ctx, sheet.reviewer)
              : 'the HOD'
            : 'the academic office',
      department: dept?.name ?? null,
      hod:
        ResultsCoreService.withHod(sheet) && sheet.reviewer
          ? ResultsCoreService.hodLabel(ctx, sheet.reviewer)
          : hod,
      withHod: ResultsCoreService.withHod(sheet),
      canDecide: term.status === 'ACTIVE' && ResultsCoreService.withOffice(sheet),
      history: await this.history(ctx),
      passMark: scheme.passMark,
      entryClosesAt: deadline ? TeacherScopeService.local(deadline) : null,
      entryReopenedUntil:
        sheet.entryReopenedUntil && sheet.entryReopenedUntil > this.now()
          ? TeacherScopeService.local(sheet.entryReopenedUntil)
          : null,
    };
  }

  /* ---------------- Corrections ---------------- */

  async correctionViews(
    ctx: SheetCtx,
    list: Prisma.ScoreCorrectionGetPayload<{
      include: { evidenceFile: { select: { originalName: true } } };
    }>[],
  ) {
    if (!list.length) return [];
    const [staff, users] = await Promise.all([
      this.db.staff.findMany({
        where: {
          id: { in: list.map((c) => c.requestedByStaffId).filter((x): x is string => !!x) },
        },
        ...person,
      }),
      this.userNames(list.flatMap((c) => [c.decidedById, c.requestedById])),
    ]);
    const { scheme } = ctx;
    const fmt = (vals: ScoreValue[]) => {
      const t = totalOf(scheme, vals);
      return t === null ? '—' : `${t.toFixed(1)} · ${gradeOf(scheme.scale, t)?.grade ?? '—'}`;
    };
    return list.map((c) => {
      const index = Math.max(
        0,
        scheme.components.findIndex((x) => x.id === c.componentId),
      );
      const comp = scheme.components[index]!;
      const row = ctx.rows.find((r) => r.studentId === c.studentId);
      const scores = row?.scores ?? scheme.components.map(() => null);
      const original = Number(c.originalScore);
      const proposed = Number(c.proposedScore);
      // An applied correction is already in the sheet: show the totals before and after it.
      const base =
        c.status === 'APPLIED' ? scores.map((v, i) => (i === index ? original : v)) : scores;
      const after = base.map((v, i) => (i === index ? proposed : v));
      const by = staff.find((s) => s.id === c.requestedByStaffId);
      const requester = by ? staffName(by) : (users.get(c.requestedById) ?? 'A teacher');
      const decider = users.get(c.decidedById ?? '') ?? 'the academic office';
      const history = [
        ...(c.status === 'APPLIED' && c.decidedAt
          ? [
              {
                id: `${c.id}-decided`,
                title: `Approved and applied by ${decider}`,
                detail: `${comp.name} ${original} → ${proposed}`,
                when: stamp(c.decidedAt),
                tone: 'success' as const,
              },
            ]
          : c.status === 'REJECTED' && c.decidedAt
            ? [
                {
                  id: `${c.id}-decided`,
                  title: `Rejected by ${decider}`,
                  detail: c.decisionNote ?? '',
                  when: stamp(c.decidedAt),
                  tone: 'error' as const,
                },
              ]
            : []),
        {
          id: `${c.id}-requested`,
          title: `Correction requested by ${requester}`,
          detail: c.evidenceFileId ? 'Reason and evidence attached' : 'Reason attached',
          when: stamp(c.requestedAt),
          tone: 'warning' as const,
        },
        {
          id: `${c.id}-published`,
          title: 'Original score published',
          detail: `${comp.name} ${original} · total ${fmt(base)}`,
          when: 'Term results',
          tone: 'neutral' as const,
        },
      ];
      return {
        id: c.id,
        sheetId: ctx.sheet.id,
        termId: ctx.sheet.termId,
        studentId: c.studentId,
        student: row?.name ?? 'Unknown student',
        armId: ctx.arm.id,
        arm: ctx.arm.label,
        subject: ctx.sheet.subject.code,
        subjectName: ctx.sheet.subject.name,
        component: `${comp.name} (max ${comp.max})`,
        componentKey: comp.key,
        original,
        proposed,
        originalTotal: fmt(base),
        proposedTotal: fmt(after),
        reason: c.reason,
        requestedBy: `${requester} · Teacher`,
        requestedAt: stamp(c.requestedAt),
        evidence: c.evidenceFile?.originalName ?? null,
        status: CORRECTION_LABEL[c.status],
        decisionNote: c.decisionNote ?? '',
        history,
      };
    });
  }
}
