import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ScoreState } from '../../generated/prisma/enums.js';
import { offeredInArm } from '../academics/academic-catalog.service.js';
import { plural, staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { CorrectionsService } from './corrections.service.js';
import {
  conflict,
  ResultsCoreService,
  SHEET_INCLUDE,
  stamp,
  type SheetCtx,
  type TermInfo,
} from './results-core.service.js';
import { isValidScore, missingOf, scoreRow, statsOf, type ScoreValue } from './scoring.js';

export interface SaveRowInput {
  studentId: string;
  scores: unknown[];
  remark?: string;
}

const STATE: Record<'ABS' | 'EXM', ScoreState> = { ABS: 'ABSENT', EXM: 'EXEMPT' };

type Staff = Awaited<ReturnType<TeacherScopeService['staff']>>;

/**
 * Teacher Workspace › Results and Reviews: my score sheets (lead teachers and co-teachers enter
 * scores; only the lead submits or recalls), and the HOD's queue of sheets to forward to the
 * academic office or return. Shapes follow the Teacher Workspace mock (`handlers/results.ts`,
 * `handlers/reviews.ts`).
 */
@Injectable()
export class TeacherResultsService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly scope: TeacherScopeService,
    private readonly corrections: CorrectionsService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }

  private async termOf(termId?: string) {
    const t = await this.scope.term(termId);
    return this.core.term(t.id);
  }

  /** My sheets for a term: one per class arm × subject I teach (lead or co-teacher). */
  async mySheets(staffId: string, term: TermInfo) {
    const [mine, classes] = await Promise.all([
      this.db.teachingAssignment.findMany({
        where: { staffId, termId: term.id },
        select: { armId: true, subjectId: true },
      }),
      this.db.classTeacherAssignment.findMany({
        where: { staffId, sessionId: term.sessionId, endsOn: null },
        select: { armId: true },
      }),
    ]);
    // Nursery (descriptive) classes: their class teacher rates every learning area.
    const pairs = [...mine];
    if (classes.length) {
      const [arms, schemes, offered] = await Promise.all([
        this.core.catalog.arms(),
        this.core.schemes(term.sessionId),
        this.core.catalog.offeredByLevel(term.sessionId),
      ]);
      for (const c of classes) {
        const arm = arms.find((a) => a.id === c.armId);
        if (!arm || schemes.get(arm.sectionId)?.mode !== 'DESCRIPTIVE') continue;
        for (const o of offeredInArm(offered.get(arm.levelId), arm.id))
          pairs.push({ armId: arm.id, subjectId: o.subjectId });
      }
    }
    const sheets = await this.core.ensureSheets(term, pairs);
    return this.core.contexts(sheets, term);
  }

  private static order(a: SheetCtx, b: SheetCtx) {
    return (
      a.arm.label.localeCompare(b.arm.label) ||
      a.arm.branch.localeCompare(b.arm.branch) ||
      a.sheet.subject.name.localeCompare(b.sheet.subject.name)
    );
  }

  async list(auth: AuthUserContext, q: { term?: string; class?: string; subject?: string }) {
    const s = await this.scope.staff(auth);
    const term = await this.termOf(q.term);
    const ctxs = (await this.mySheets(s.id, term))
      .filter((c) => !q.class || c.arm.id === q.class)
      .filter((c) => !q.subject || c.sheet.subject.code === q.subject)
      .sort((a, b) => TeacherResultsService.order(a, b));
    return {
      termId: term.id,
      deadline: term.resultEntryClosesAt
        ? TeacherScopeService.local(term.resultEntryClosesAt)
        : null,
      entryOpen: term.status === 'ACTIVE' && !this.core.entryClosed(term),
      sheets: ctxs.map((c) => this.core.summary(c)),
      corrections: await this.corrections.mine(s.id, term.id),
    };
  }

  /** A sheet I teach (lead or co-teacher), or 404 / 403. */
  async mine(auth: AuthUserContext, sheetId: string) {
    const s = await this.scope.staff(auth);
    const sheet = await this.core.sheetById(sheetId);
    const ctx = await this.core.context(sheet);
    if (!ctx.teacherIds.includes(s.id))
      throw AppException.forbidden(
        `You don’t have access to the ${ctx.arm.label} · ${sheet.subject.name} sheet. You don’t teach it in ${ctx.term.name}.`,
      );
    return { s, ctx };
  }

  async get(auth: AuthUserContext, sheetId: string) {
    const { s, ctx } = await this.mine(auth, sheetId);
    return this.core.teacherView(ctx, s.id);
  }

  private async reload(sheetId: string, viewer: string | null) {
    const ctx = await this.core.context(await this.core.sheetById(sheetId));
    return this.core.teacherView(ctx, viewer);
  }

  /** Saves a draft (lead or co-teacher). Validates every value; Not started becomes Draft. */
  async save(
    auth: AuthUserContext,
    sheetId: string,
    body: { rows?: SaveRowInput[]; revision?: number },
  ) {
    const { s, ctx } = await this.mine(auth, sheetId);
    this.core.requireEditable(ctx);
    const { sheet, scheme } = ctx;
    if (body.revision !== undefined && body.revision !== sheet.revision)
      throw conflict(
        'Someone else saved this sheet since you opened it. Refresh to see their changes, then save again.',
        'STALE_SHEET',
      );
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows)
      throw AppException.validation({ rows: 'Send the rows to save.' }, 'Send the rows to save.');
    const onSheet = new Set(ctx.students.map((x) => x.id));
    const fields: Record<string, string> = {};
    for (const row of rows) {
      if (!row || !onSheet.has(row.studentId)) {
        fields[String(row?.studentId ?? 'row')] = 'This student isn’t on the sheet.';
        continue;
      }
      if (!Array.isArray(row.scores) || row.scores.length !== scheme.components.length) {
        fields[row.studentId] = `Send ${scheme.components.length} scores.`;
        continue;
      }
      if (scheme.mode === 'DESCRIPTIVE') {
        const v = row.scores[0];
        if (
          v !== null &&
          !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= scheme.ratings.length)
        )
          fields[`${row.studentId}.rating`] = 'Choose a rating from the scale.';
      } else
        row.scores.forEach((v, i) => {
          const c = scheme.components[i]!;
          if (!isValidScore(v, c.max))
            fields[`${row.studentId}.${c.key}`] =
              `Enter 0–${c.max} (one decimal place at most), ABS or EXM`;
        });
      if (row.remark !== undefined && (typeof row.remark !== 'string' || row.remark.length > 300))
        fields[`${row.studentId}.remark`] = 'Keep the remark under 300 characters.';
    }
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Some scores aren’t valid. Fix the highlighted cells.');
    const schoolId = ResultsCoreService.schoolId();
    const now = this.core.now();
    await this.db.$transaction(async (tx) => {
      const bumped = await tx.resultSheet.updateMany({
        where: { id: sheet.id, revision: sheet.revision },
        data: {
          status: sheet.status === 'NOT_STARTED' ? 'DRAFT' : sheet.status,
          savedAt: now,
          revision: { increment: 1 },
        },
      });
      if (!bumped.count)
        throw conflict(
          'Someone else saved this sheet at the same moment. Refresh to see their changes, then save again.',
          'STALE_SHEET',
        );
      for (const row of rows) {
        const values = row.scores as ScoreValue[];
        const r = scoreRow(scheme, values);
        const remark = row.remark === undefined ? undefined : row.remark.trim() || null;
        const existing = ctx.entries.get(row.studentId);
        if (scheme.mode === 'DESCRIPTIVE') {
          // Nursery: the rating is kept on the entry; there are no scores.
          const v = values[0];
          const ratingId = typeof v === 'number' ? scheme.ratings[v - 1]!.id : null;
          const data = {
            ratingId,
            total: null,
            grade: r.grade,
            ...(remark !== undefined && { teacherRemark: remark }),
          };
          if (existing) await tx.resultEntry.update({ where: { id: existing.id }, data });
          else
            await tx.resultEntry.create({
              data: { schoolId, sheetId: sheet.id, studentId: row.studentId, ...data },
            });
          continue;
        }
        const entry = existing
          ? await tx.resultEntry.update({
              where: { id: existing.id },
              data: {
                total: r.total,
                grade: r.grade,
                ...(remark !== undefined && { teacherRemark: remark }),
              },
            })
          : await tx.resultEntry.create({
              data: {
                schoolId,
                sheetId: sheet.id,
                studentId: row.studentId,
                total: r.total,
                grade: r.grade,
                teacherRemark: remark ?? null,
              },
            });
        await tx.resultScore.deleteMany({ where: { entryId: entry.id } });
        const cells = scheme.components.flatMap((c, i) => {
          const v = values[i];
          if (v === null || v === undefined) return [];
          return [
            {
              schoolId,
              entryId: entry.id,
              componentId: c.id,
              state: typeof v === 'number' ? ('SCORED' as const) : STATE[v],
              score: typeof v === 'number' ? v : null,
            },
          ];
        });
        if (cells.length) await tx.resultScore.createMany({ data: cells });
      }
      if (sheet.status === 'NOT_STARTED')
        await this.core.event(tx, sheet, 'SAVED', 'DRAFT', { userId: auth.userId, staffId: s.id });
    });
    return this.reload(sheet.id, s.id);
  }

  /** Lead teacher only: sends the sheet to its HOD (Submitted) or the academic office. */
  async submit(auth: AuthUserContext, sheetId: string) {
    const { s, ctx } = await this.mine(auth, sheetId);
    const { sheet, scheme } = ctx;
    this.requireLead(ctx, s);
    this.core.requireEditable(ctx);
    if (!ctx.rows.length)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'There are no students on this sheet to submit.',
        'VALIDATION',
      );
    const blockers = ctx.rows.filter((r) => missingOf(scheme.components, r.scores).length);
    if (blockers.length) {
      const names = blockers.slice(0, 3).map((b) => b.name);
      throw AppException.validation(
        Object.fromEntries(
          blockers.map((b) => [
            b.studentId,
            `${missingOf(scheme.components, b.scores).join(', ')} missing`,
          ]),
        ),
        scheme.mode === 'DESCRIPTIVE'
          ? `${blockers.length} child${blockers.length === 1 ? ' has' : 'ren have'} no rating yet (${names.join(', ')}${blockers.length > 3 ? ', …' : ''}). Rate every child before submitting.`
          : `${blockers.length} student${blockers.length === 1 ? ' has' : 's have'} missing scores (${names.join(', ')}${blockers.length > 3 ? ', …' : ''}). Enter every score — ABS for absent, EXM for exempt — before submitting.`,
      );
    }
    const target = await this.core.submitTo(ctx);
    const resubmit = sheet.status === 'RETURNED';
    const next = target.hodId ? 'SUBMITTED' : 'UNDER_REVIEW';
    const now = this.core.now();
    const name = staffName(s);
    const stats = statsOf(scheme, ctx.rows);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: {
          status: next,
          reviewerStaffId: target.hodId,
          submittedAt: now,
          savedAt: sheet.savedAt ?? now,
          returnedBy: null,
          returnNote: null,
          forwardedAt: null,
        },
      });
      await this.core.event(
        tx,
        sheet,
        'SUBMITTED',
        next,
        { userId: auth.userId, staffId: s.id },
        target.label,
      );
      await this.core.notifyStaff(tx, [target.hodId], {
        category: 'reviews',
        title: `${name} ${resubmit ? 'resubmitted' : 'submitted'} a result sheet`,
        body: `${ctx.arm.label} · ${sheet.subject.name} is waiting for your review.`,
        link: `/reviews/result-sheets/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: resubmit ? 'results.resubmit' : 'results.submit',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `${ctx.arm.label} ${sheet.subject.name} ${resubmit ? 'resubmitted' : 'submitted'} by ${name}`,
          detail: `To ${target.label} · ${plural(ctx.rows.length, 'student')} · class average ${stats.average ?? '—'}%`,
        },
        asTx(tx),
      );
    });
    return this.reload(sheet.id, s.id);
  }

  /** Lead teacher only: takes a submitted sheet back to Draft before the HOD or office acts. */
  async recall(auth: AuthUserContext, sheetId: string) {
    const { s, ctx } = await this.mine(auth, sheetId);
    const { sheet, term } = ctx;
    this.requireLead(ctx, s);
    const termLock = TeacherScopeService.lockReason(term);
    if (termLock) throw conflict(termLock, 'TERM_LOCKED');
    if (!ResultsCoreService.canRecall(ctx)) {
      const why =
        sheet.status === 'UNDER_REVIEW'
          ? 'The HOD already forwarded it to the academic office'
          : sheet.status === 'APPROVED' || sheet.status === 'PUBLISHED'
            ? `The academic office already ${sheet.status === 'APPROVED' ? 'approved' : 'published'} it`
            : sheet.status === 'RETURNED'
              ? 'It was already returned to you'
              : 'It hasn’t been submitted';
      throw conflict(`${why}, so there’s nothing to recall.`, 'NOT_RECALLABLE');
    }
    if (this.core.entryClosed(term, sheet))
      throw conflict(
        'Result entry has closed, so the sheet stays with its reviewer. Ask the academic office to reopen entry first.',
        'TERM_LOCKED',
      );
    const name = staffName(s);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: { status: 'DRAFT', submittedAt: null },
      });
      await this.core.event(tx, sheet, 'RECALLED', 'DRAFT', { userId: auth.userId, staffId: s.id });
      if (ResultsCoreService.withHod(sheet))
        await this.core.notifyStaff(tx, [sheet.reviewerStaffId], {
          category: 'reviews',
          title: `${name} recalled a result sheet`,
          body: `${ctx.arm.label} · ${sheet.subject.name} is back with the teacher. You don’t need to review it yet.`,
          link: '/reviews/result-sheets',
          sheetId: sheet.id,
        });
      await this.audit.record(
        {
          action: 'results.recall',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `${ctx.arm.label} ${sheet.subject.name} recalled by ${name}`,
        },
        asTx(tx),
      );
    });
    return this.reload(sheet.id, s.id);
  }

  private requireLead(ctx: SheetCtx, s: Staff) {
    if (ctx.sheet.teacherStaffId === s.id) return;
    const lead = ctx.sheet.teacher ? staffName(ctx.sheet.teacher) : null;
    throw new AppException(
      HttpStatus.FORBIDDEN,
      lead
        ? `Only the lead teacher, ${lead}, can submit or recall this sheet. You can still enter and save scores.`
        : 'This sheet has no lead teacher yet, so it can’t be submitted. Ask the academic office.',
      'NOT_LEAD',
    );
  }

  /* ---------------- Reviews (HODs) ---------------- */

  private static departments(s: Staff) {
    if (s.hodOf.length) return s.hodOf;
    return s.roleKeys.includes('hod') && s.department ? [s.department] : [];
  }

  private requireReviewer(s: Staff) {
    const depts = TeacherResultsService.departments(s);
    if (!depts.length && !s.roleKeys.includes('hod'))
      throw AppException.forbidden('Result sheet reviews are for heads of department.');
    return depts;
  }

  /** Sheets waiting on this HOD in a term. */
  waitingOn(staffId: string, termId: string) {
    return this.db.resultSheet.count({
      where: {
        termId,
        reviewerStaffId: staffId,
        status: 'SUBMITTED',
        NOT: { teacherStaffId: staffId },
      },
    });
  }

  private reviewSummary(ctx: SheetCtx, decision: string | null) {
    const summary = this.core.summary(ctx);
    const stats = statsOf(ctx.scheme, ctx.rows);
    return {
      id: summary.id,
      armId: summary.armId,
      arm: summary.arm,
      subject: summary.subject,
      subjectName: summary.subjectName,
      branchName: summary.branchName,
      teacher: ctx.sheet.teacher ? staffName(ctx.sheet.teacher) : 'No teacher assigned',
      students: summary.students,
      status: summary.status,
      submittedAt: summary.submittedAt,
      average: stats.average,
      absent: stats.absent,
      exempt: stats.exempt,
      decision,
    };
  }

  /** My latest decision on each sheet ("Forwarded 8 Dec, 09:10"), newest first. */
  private async decisions(staffId: string, termId?: string, sheetId?: string) {
    const events = await this.db.resultSheetEvent.findMany({
      where: {
        actorStaffId: staffId,
        action: { in: ['FORWARDED', 'RETURNED'] },
        ...(sheetId && { sheetId }),
        ...(termId && { sheet: { termId } }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const out = new Map<string, { label: string; at: Date }>();
    for (const e of events)
      if (!out.has(e.sheetId))
        out.set(e.sheetId, {
          label: `${e.action === 'FORWARDED' ? 'Forwarded' : 'Returned'} ${stamp(e.createdAt)}`,
          at: e.createdAt,
        });
    return out;
  }

  async reviewList(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const depts = this.requireReviewer(s);
    const term = await this.termOf(termId);
    const decided = await this.decisions(s.id, term.id);
    const sheets = await this.db.resultSheet.findMany({
      where: {
        termId: term.id,
        NOT: { teacherStaffId: s.id },
        OR: [{ reviewerStaffId: s.id, status: 'SUBMITTED' }, { id: { in: [...decided.keys()] } }],
      },
      include: SHEET_INCLUDE,
    });
    const ctxs = await this.core.contexts(sheets, term);
    const waiting = ctxs.filter(
      (c) => c.sheet.status === 'SUBMITTED' && c.sheet.reviewerStaffId === s.id,
    );
    const recent = ctxs.filter((c) => !waiting.includes(c));
    return {
      department: depts.map((d) => d.name).join(', '),
      waiting: waiting
        .sort(
          (a, b) => (a.sheet.submittedAt?.getTime() ?? 0) - (b.sheet.submittedAt?.getTime() ?? 0),
        )
        .map((c) => this.reviewSummary(c, null)),
      recent: recent
        .sort(
          (a, b) =>
            (decided.get(b.sheet.id)?.at.getTime() ?? 0) -
            (decided.get(a.sheet.id)?.at.getTime() ?? 0),
        )
        .map((c) => this.reviewSummary(c, decided.get(c.sheet.id)?.label ?? null)),
    };
  }

  /** A sheet this HOD may open: sent to them (or decided by them), never their own. */
  private async reviewable(auth: AuthUserContext, sheetId: string) {
    const s = await this.scope.staff(auth);
    const depts = this.requireReviewer(s);
    const sheet = await this.core.sheetById(sheetId);
    const ctx = await this.core.context(sheet);
    const dept = sheet.subject.department;
    if (sheet.teacherStaffId === s.id)
      throw AppException.forbidden(
        'You can’t review your own sheet. It goes straight to the academic office when you submit it.',
      );
    const decided = (await this.decisions(s.id, undefined, sheet.id)).get(sheet.id);
    if (sheet.reviewerStaffId !== s.id && !decided) {
      if (dept && !depts.some((d) => d.id === dept.id))
        throw AppException.forbidden(
          `You don’t review ${dept.name} sheets. You review ${depts.map((d) => d.name).join(', ') || 'no department’s'} sheets.`,
        );
      throw AppException.forbidden('This sheet hasn’t been submitted to you for review.');
    }
    return { s, ctx, decided };
  }

  async reviewSheet(auth: AuthUserContext, sheetId: string) {
    const { s, ctx } = await this.reviewable(auth, sheetId);
    const { sheet } = ctx;
    const waiting = ResultsCoreService.withHod(sheet) && sheet.reviewerStaffId === s.id;
    const canDecide = waiting && ctx.term.status === 'ACTIVE';
    return {
      ...(await this.core.teacherView(ctx, s.id)),
      canDecide,
      decisionNote: canDecide
        ? null
        : waiting
          ? 'This term is closed. Its sheets are read-only.'
          : sheet.status === 'RETURNED' && sheet.returnedBy === 'HOD'
            ? 'You returned this sheet to the teacher. It comes back to you when they resubmit.'
            : sheet.status === 'DRAFT'
              ? 'The teacher recalled this sheet. It comes back to you when they resubmit.'
              : 'You forwarded this sheet. It’s with the academic office now.',
    };
  }

  /** 409 when the sheet is no longer waiting on this HOD. */
  private requireWaitingOn(ctx: SheetCtx, staffId: string) {
    const reason = TeacherScopeService.lockReason(ctx.term);
    if (reason) throw conflict(reason, 'TERM_LOCKED');
    const s = ctx.sheet;
    if (ResultsCoreService.withHod(s) && s.reviewerStaffId === staffId) return;
    const what =
      s.status === 'RETURNED'
        ? 'already returned to the teacher'
        : s.status === 'UNDER_REVIEW'
          ? 'already forwarded to the academic office'
          : s.status === 'APPROVED' || s.status === 'PUBLISHED'
            ? `already ${s.status.toLowerCase()}`
            : s.status === 'DRAFT'
              ? 'recalled by the teacher'
              : 'not waiting for your review';
    throw conflict(`This sheet was ${what}.`, 'SHEET_LOCKED');
  }

  async forward(auth: AuthUserContext, sheetId: string) {
    const { s, ctx } = await this.reviewable(auth, sheetId);
    this.requireWaitingOn(ctx, s.id);
    const { sheet } = ctx;
    const name = staffName(s);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: { status: 'UNDER_REVIEW', forwardedAt: this.core.now() },
      });
      await this.core.event(tx, sheet, 'FORWARDED', 'UNDER_REVIEW', {
        userId: auth.userId,
        staffId: s.id,
      });
      await this.core.notifyStaff(tx, [sheet.teacherStaffId], {
        category: 'results',
        title: `${name} forwarded your result sheet`,
        body: `${ctx.arm.label} · ${sheet.subject.name} is now with the academic office.`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.forward',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `${ctx.arm.label} ${sheet.subject.name} forwarded by HOD ${name}`,
        },
        asTx(tx),
      );
    });
    return this.reload(sheet.id, s.id);
  }

  async returnSheet(auth: AuthUserContext, sheetId: string, comment: unknown) {
    const { s, ctx } = await this.reviewable(auth, sheetId);
    this.requireWaitingOn(ctx, s.id);
    const note = typeof comment === 'string' ? comment.trim() : '';
    if (note.length < 10)
      throw AppException.validation({
        comment: 'Tell the teacher what to fix (10 characters or more).',
      });
    const { sheet } = ctx;
    const name = staffName(s);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: {
          status: 'RETURNED',
          returnedBy: 'HOD',
          returnedAt: this.core.now(),
          returnNote: note,
        },
      });
      await this.core.event(
        tx,
        sheet,
        'RETURNED',
        'RETURNED',
        { userId: auth.userId, staffId: s.id },
        note,
      );
      await this.core.notifyStaff(tx, [sheet.teacherStaffId], {
        category: 'results',
        title: `${name} returned your result sheet`,
        body: `${ctx.arm.label} · ${sheet.subject.name}: “${note}”`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.return',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `${ctx.arm.label} ${sheet.subject.name} returned by HOD ${name}`,
          detail: note,
        },
        asTx(tx),
      );
    });
    return this.reload(sheet.id, s.id);
  }
}
