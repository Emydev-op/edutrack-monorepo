import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { SheetStatus } from '../../generated/prisma/enums.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import { fmtDate, fromIso, staffName } from '../academics/academic-format.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import {
  CONDUCT_TRAITS,
  ReportCardsService,
  TRAIT,
  type ConductLabel,
  type StudentResults,
} from './report-cards.service.js';
import {
  conflict,
  ResultsCoreService,
  SHEET_STATUSES,
  STATUS_LABEL,
  stamp,
  type TermInfo,
} from './results-core.service.js';
import { completionOf, statsOf } from './scoring.js';

const REMINDABLE: SheetStatus[] = ['NOT_STARTED', 'DRAFT', 'RETURNED'];
const FINAL: SheetStatus[] = ['APPROVED', 'PUBLISHED'];
const REMARK = { min: 20, max: 400 };

/**
 * My class (class teachers), the results parts: class progress across every subject's sheet with
 * once-a-day reminders to subject teachers, and each student's report-card remark (20–400
 * characters) and five conduct ratings, editable until the class's results are published.
 * Shapes follow the Teacher Workspace mock (`handlers/class-teacher.ts`).
 */
@Injectable()
export class ClassResultsService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly scope: TeacherScopeService,
    private readonly cards: ReportCardsService,
    private readonly attendance: AttendanceService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }

  private async myArm(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const t = await this.scope.term(termId);
    const term = await this.core.term(t.id);
    const arm = await this.scope.classArm(s.id, term);
    if (!arm)
      throw AppException.forbidden(
        'You don’t have access to My class. You aren’t a class teacher this term.',
      );
    return {
      s,
      term,
      arm,
      ref: { armId: arm.id, arm: arm.label, branchName: arm.branch, termId: term.id },
    };
  }

  /** Every subject's sheet for the arm (created when missing). */
  async armSheets(term: TermInfo, arm: ArmInfo) {
    const subjects = await this.cards.armSubjects(term, arm);
    const sheets = await this.core.ensureSheets(
      term,
      subjects.map((s) => ({ armId: arm.id, subjectId: s.subjectId })),
    );
    return (await this.core.contexts(sheets, term)).sort((a, b) =>
      a.sheet.subject.name.localeCompare(b.sheet.subject.name),
    );
  }

  /* ---------------- Class progress ---------------- */

  async progress(auth: AuthUserContext, termId?: string) {
    const { s, term, arm, ref } = await this.myArm(auth, termId);
    const ctxs = await this.armSheets(term, arm);
    const editable = term.status === 'ACTIVE';
    const today = this.attendance.today();
    const [reminders, roll] = await Promise.all([
      this.db.resultSheetReminder.findMany({
        where: { sheetId: { in: ctxs.map((c) => c.sheet.id) }, sentOn: fromIso(today) },
      }),
      this.scope.roll(term.sessionId, [arm.id]),
    ]);
    const summary = Object.fromEntries(SHEET_STATUSES.map((x) => [x, 0])) as Record<string, number>;
    for (const c of ctxs) summary[STATUS_LABEL[c.sheet.status]]!++;
    return {
      ...ref,
      students: roll.length,
      deadline: term.resultEntryClosesAt
        ? TeacherScopeService.local(term.resultEntryClosesAt)
        : null,
      editable,
      summary,
      subjects: ctxs.map((c) => {
        const isMine = c.teacherIds.includes(s.id);
        const sent = reminders.find((r) => r.sheetId === c.sheet.id);
        const remindedAt = sent ? TeacherScopeService.local(sent.createdAt) : null;
        return {
          sheetId: c.sheet.id,
          subject: c.sheet.subject.code,
          subjectName: c.sheet.subject.name,
          teacherId: c.sheet.teacherStaffId ?? '',
          teacherName: c.sheet.teacher ? staffName(c.sheet.teacher) : 'No teacher assigned',
          status: STATUS_LABEL[c.sheet.status],
          withHod: ResultsCoreService.withHod(c.sheet),
          completion: completionOf(c.scheme.components.length, c.rows),
          average: statsOf(c.scheme, c.rows).average,
          isMine,
          canRemind:
            editable &&
            !isMine &&
            !!c.sheet.teacherStaffId &&
            REMINDABLE.includes(c.sheet.status) &&
            !remindedAt,
          remindedAt,
        };
      }),
    };
  }

  async remind(auth: AuthUserContext, sheetId: string, termId?: string) {
    const { s, term, arm } = await this.myArm(auth, termId);
    const sheet = await this.db.resultSheet.findFirst({
      where: { id: sheetId, termId: term.id, armId: arm.id },
    });
    if (!sheet)
      throw AppException.forbidden(
        `You can only send reminders about ${arm.label}’s subjects. That sheet isn’t one of them.`,
      );
    const lock = TeacherScopeService.lockReason(term);
    if (lock) throw conflict(lock, 'TERM_LOCKED');
    const ctx = await this.core.context(await this.core.sheetById(sheet.id), term);
    const subject = ctx.sheet.subject.name;
    const teacher = ctx.sheet.teacher ? staffName(ctx.sheet.teacher) : null;
    if (ctx.teacherIds.includes(s.id))
      throw conflict('This is your own sheet. Open it from Results to finish it.', 'OWN_SHEET');
    if (!teacher || !ctx.sheet.teacherStaffId)
      throw conflict(
        `${subject} has no teacher assigned yet. Ask the academic office.`,
        'NO_TEACHER',
      );
    if (!REMINDABLE.includes(ctx.sheet.status))
      throw conflict(
        `${teacher} has already submitted ${subject}. There’s nothing to remind them about.`,
        'NOT_REMINDABLE',
      );
    const today = this.attendance.today();
    const already = await this.db.resultSheetReminder.findFirst({
      where: { sheetId: sheet.id, sentOn: fromIso(today) },
    });
    if (already)
      throw conflict(
        `You already reminded ${teacher} about ${subject} today. You can remind them again tomorrow.`,
        'ALREADY_REMINDED',
      );
    const missing = completionOf(ctx.scheme.components.length, ctx.rows).missing;
    const now = this.core.now();
    await this.db.$transaction(async (tx) => {
      await tx.resultSheetReminder.create({
        data: {
          schoolId: ResultsCoreService.schoolId(),
          sheetId: sheet.id,
          sentById: auth.userId,
          sentOn: fromIso(today),
          createdAt: now,
        },
      });
      await this.core.notifyStaff(tx, [ctx.sheet.teacherStaffId], {
        category: 'results',
        title: `${staffName(s)} reminded you about ${arm.label} · ${subject}`,
        body: `Class teacher of ${arm.label}: ${
          ctx.sheet.status === 'RETURNED'
            ? 'your returned sheet is waiting to be fixed and resubmitted'
            : missing
              ? `${missing} student${missing === 1 ? ' is' : 's are'} missing scores`
              : 'the sheet is ready to submit'
        }. Result entry closes ${term.resultEntryClosesAt ? fmtDate(TeacherScopeService.local(term.resultEntryClosesAt).slice(0, 10), false) : 'soon'}.`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
    });
    return { remindedAt: TeacherScopeService.local(now), teacherName: teacher };
  }

  /* ---------------- Report cards ---------------- */

  /** Why remarks for the arm can't change: a read-only term, or published results. */
  async lock(term: TermInfo, armId: string) {
    const reason = TeacherScopeService.lockReason(term);
    if (reason) return { code: 'TERM_LOCKED', reason };
    const published = await this.db.resultPublication.findFirst({
      where: { termId: term.id, armId },
    });
    if (published)
      return {
        code: 'RESULTS_PUBLISHED',
        reason: `${term.name} results for this class are published, so remarks and ratings are read-only.`,
      };
    return null;
  }

  private static done(
    card: { classTeacherRemark: string | null; conduct: { rating: number }[] } | null | undefined,
  ) {
    return (
      !!card?.classTeacherRemark && (card?.conduct.filter((c) => c.rating >= 1).length ?? 0) >= 5
    );
  }

  /** Remarks and ratings done for the arm, of the students on its roll. */
  async remarksProgress(term: TermInfo, armId: string) {
    const roll = await this.scope.roll(term.sessionId, [armId]);
    const cards = await this.cards.remarks(
      term.id,
      roll.map((e) => e.studentId),
    );
    return {
      done: roll.filter((e) => ClassResultsService.done(cards.get(e.studentId))).length,
      total: roll.length,
    };
  }

  private static results(r: StudentResults | undefined) {
    return (r?.subjects ?? []).map((s) => {
      const final = FINAL.includes(s.status as SheetStatus);
      return {
        subject: s.code,
        subjectName: s.name,
        total: final ? s.total : null,
        grade: final ? s.grade : null,
        status: STATUS_LABEL[s.status],
      };
    });
  }

  async reportCards(auth: AuthUserContext, termId?: string) {
    const { term, arm, ref } = await this.myArm(auth, termId);
    const [roll, results, lock, att] = await Promise.all([
      this.scope.roll(term.sessionId, [arm.id]),
      this.cards.armResults(term, arm),
      this.lock(term, arm.id),
      this.cards.attendanceFor(term, arm.id),
    ]);
    const cards = await this.cards.remarks(
      term.id,
      roll.map((e) => e.studentId),
    );
    return {
      ...ref,
      term: `${term.session.name} · ${term.name}`,
      editable: !lock,
      lockReason: lock?.reason ?? null,
      progress: {
        done: roll.filter((e) => ClassResultsService.done(cards.get(e.studentId))).length,
        total: roll.length,
      },
      subjects: results.subjects
        .map((s) => ({ code: s.code, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      students: roll.map((e) => {
        const card = cards.get(e.studentId);
        const ref = ResultsCoreService.studentRef(e.student);
        return {
          studentId: e.studentId,
          name: ref.name,
          admissionNo: ref.admissionNo,
          done: ClassResultsService.done(card),
          remark: card?.classTeacherRemark ?? null,
          results: ClassResultsService.results(
            results.students.find((x) => x.student.id === e.studentId),
          ),
          attendance: att.byStudent.get(e.studentId) ?? ReportCardsService.emptyAttendance(),
        };
      }),
    };
  }

  async reportCard(auth: AuthUserContext, studentId: string, termId?: string) {
    const { term, arm, ref } = await this.myArm(auth, termId);
    return this.entry(term, arm, ref, studentId);
  }

  private async entry(
    term: TermInfo,
    arm: ArmInfo,
    ref: { armId: string; arm: string; branchName: string; termId: string },
    studentId: string,
  ) {
    const roll = await this.scope.roll(term.sessionId, [arm.id]);
    const index = roll.findIndex((e) => e.studentId === studentId);
    if (index < 0) {
      const st = await this.db.student.findFirst({ where: { id: studentId } });
      if (!st) throw AppException.notFound('Student not found', 'NOT_FOUND');
      throw AppException.forbidden(
        `You don’t have access to ${st.firstName} ${st.surname}’s report card. You’re the class teacher of ${arm.label}.`,
      );
    }
    const student = ResultsCoreService.studentRef(roll[index]!.student);
    const [results, lock, att, cards] = await Promise.all([
      this.cards.armResults(term, arm),
      this.lock(term, arm.id),
      this.cards.attendanceFor(term, arm.id),
      this.cards.remarks(term.id, [studentId]),
    ]);
    const card = cards.get(studentId);
    const by = card?.remarkById
      ? (await this.core.userNames([card.remarkById])).get(card.remarkById)
      : null;
    return {
      ...ref,
      student: {
        id: student.id,
        name: student.name,
        admissionNo: student.admissionNo,
        gender: student.gender,
      },
      term: `${term.session.name} · ${term.name}`,
      remark: card?.classTeacherRemark ?? '',
      ratings: Object.fromEntries(
        CONDUCT_TRAITS.map((t) => [
          t,
          card?.conduct.find((c) => c.trait === TRAIT[t])?.rating ?? null,
        ]),
      ) as Record<ConductLabel, number | null>,
      done: ClassResultsService.done(card),
      updatedAt: card?.remarkUpdatedAt ? TeacherScopeService.local(card.remarkUpdatedAt) : null,
      updatedBy: by ?? null,
      results: ClassResultsService.results(
        results.students.find((x) => x.student.id === studentId),
      ),
      attendance: att.byStudent.get(studentId) ?? ReportCardsService.emptyAttendance(),
      editable: !lock,
      lockReason: lock?.reason ?? null,
      index: index + 1,
      total: roll.length,
      prevId: roll[index - 1]?.studentId ?? null,
      nextId: roll[index + 1]?.studentId ?? null,
      history: card?.remarkUpdatedAt
        ? [
            {
              id: `${card.id}-remark`,
              title: `Remark and ratings saved${by ? ` by ${by}` : ''}`,
              detail: CONDUCT_TRAITS.map(
                (t) => `${t} ${card.conduct.find((c) => c.trait === TRAIT[t])?.rating ?? '—'}`,
              ).join(' · '),
              when: stamp(card.remarkUpdatedAt),
              tone: 'success' as const,
            },
          ]
        : [],
    };
  }

  async saveReportCard(
    auth: AuthUserContext,
    studentId: string,
    body: { remark?: unknown; ratings?: Record<string, unknown> },
    termId?: string,
  ) {
    const { s, term, arm, ref } = await this.myArm(auth, termId);
    const roll = await this.scope.roll(term.sessionId, [arm.id]);
    const e = roll.find((x) => x.studentId === studentId);
    if (!e) return this.entry(term, arm, ref, studentId); // 403 / 404 with the right message.
    const lock = await this.lock(term, arm.id);
    if (lock) throw conflict(lock.reason, lock.code);
    const fields: Record<string, string> = {};
    const remark = typeof body.remark === 'string' ? body.remark.trim() : '';
    if (!remark) fields.remark = 'Write a remark for this student.';
    else if (remark.length < REMARK.min)
      fields.remark = `Write at least ${REMARK.min} characters (${remark.length} so far).`;
    else if (remark.length > REMARK.max)
      fields.remark = `Keep the remark to ${REMARK.max} characters (${remark.length} now).`;
    const ratings: Partial<Record<ConductLabel, number>> = {};
    for (const trait of CONDUCT_TRAITS) {
      const v = body.ratings?.[trait];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5)
        fields[`ratings.${trait}`] = `Rate ${trait.toLowerCase()} from 1 to 5.`;
      else ratings[trait] = v;
    }
    if (Object.keys(fields).length)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Check the remark and give all five ratings before saving.',
        'VALIDATION',
        fields,
      );
    const schoolId = ResultsCoreService.schoolId();
    const now = this.core.now();
    const name = `${e.student.firstName} ${e.student.surname}`;
    await this.db.$transaction(async (tx) => {
      const existing = await tx.reportCard.findFirst({ where: { termId: term.id, studentId } });
      const data = {
        classTeacherStaffId: s.id,
        classTeacherRemark: remark,
        remarkById: auth.userId,
        remarkUpdatedAt: now,
      };
      const card = existing
        ? await tx.reportCard.update({ where: { id: existing.id }, data })
        : await tx.reportCard.create({
            data: { schoolId, termId: term.id, studentId, armId: arm.id, ...data },
          });
      await tx.conductRating.deleteMany({ where: { reportCardId: card.id } });
      await tx.conductRating.createMany({
        data: CONDUCT_TRAITS.map((t) => ({
          schoolId,
          reportCardId: card.id,
          trait: TRAIT[t],
          rating: ratings[t]!,
        })),
      });
      await this.audit.record(
        {
          action: existing?.classTeacherRemark ? 'report_card.remark_update' : 'report_card.remark',
          area: 'Academic',
          entity: 'ReportCard',
          entityId: card.id,
          summary: `${existing?.classTeacherRemark ? 'Remark updated' : 'Remark and ratings added'} for ${name}`,
          detail: `${arm.label} · ${term.name}`,
        },
        asTx(tx),
      );
    });
    return this.entry(term, arm, ref, studentId);
  }
}
