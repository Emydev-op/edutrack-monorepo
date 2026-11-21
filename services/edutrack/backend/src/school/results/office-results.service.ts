import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { SheetStatus } from '../../generated/prisma/enums.js';
import { offeredInArm, type ArmInfo } from '../academics/academic-catalog.service.js';
import { fmtDate, plural } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import {
  conflict,
  ResultsCoreService,
  SHEET_STATUSES,
  STATUS_LABEL,
  type SheetCtx,
  type TermInfo,
} from './results-core.service.js';
import { statsOf } from './scoring.js';

/**
 * School Admin › Academics › Results, the academic office's side: the results matrix (every arm ×
 * subject's sheet status), a sheet read-only with approve / return once it's with the office,
 * and reopening entry for a sheet after the term's deadline. Section admins act only on their
 * sections' arms. Shapes follow the School Admin mock (`handlers/academics-results.ts`).
 */
@Injectable()
export class OfficeResultsService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly sections: SectionAccessService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }

  private async staffIdOf(auth: AuthUserContext) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId },
      select: { staffId: true },
    });
    return m?.staffId ?? null;
  }

  /* ---------------- Matrix ---------------- */

  async matrix(q: { term?: string; section?: string; branch?: string }) {
    const term = await this.core.adminTerm(q.term);
    const structure = this.core.catalog.structure;
    const branches = await structure.activeBranches();
    const branchId = branches.find((b) => b.name === q.branch)?.id ?? branches[0]?.id ?? null;
    const [arms, allSections, offered, schemes] = await Promise.all([
      this.core.catalog.arms(branchId),
      structure.sections(),
      this.core.catalog.offeredByLevel(term.sessionId),
      this.core.schemes(term.sessionId),
    ]);
    const sections = allSections.filter((s) => arms.some((a) => a.sectionId === s.id));
    const names = sections.map((s) => s.name);
    const section = names.includes(q.section ?? '')
      ? q.section!
      : (names.find((s) => s === 'Junior Secondary') ?? names[0] ?? '');
    const sectionRow = sections.find((s) => s.name === section);
    const mine = arms.filter((a) => a.section === section);
    const byArm = new Map(mine.map((a) => [a.id, offeredInArm(offered.get(a.levelId), a.id)]));
    const subjectMap = new Map<string, { code: string; name: string }>();
    for (const list of byArm.values())
      for (const s of list) subjectMap.set(s.subjectId, { code: s.code, name: s.name });
    const subjects = [...subjectMap.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
    const [sheets, publications] = await Promise.all([
      this.db.resultSheet.findMany({
        where: { termId: term.id, armId: { in: mine.map((a) => a.id) } },
        select: { armId: true, subjectId: true, status: true },
      }),
      this.db.resultPublication.findMany({
        where: { termId: term.id, armId: { in: mine.map((a) => a.id) } },
      }),
    ]);
    const counts = Object.fromEntries(SHEET_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    const rows = mine.map((arm) => {
      const takes = new Set(byArm.get(arm.id)!.map((s) => s.subjectId));
      const cells: Record<string, string | null> = {};
      for (const [id, s] of subjects) {
        if (!takes.has(id)) {
          cells[s.code] = null;
          continue;
        }
        const st: SheetStatus =
          sheets.find((x) => x.armId === arm.id && x.subjectId === id)?.status ?? 'NOT_STARTED';
        counts[STATUS_LABEL[st]]!++;
        cells[s.code] = STATUS_LABEL[st];
      }
      const values = Object.values(cells).filter((v): v is string => v !== null);
      const published =
        publications.some((p) => p.armId === arm.id) &&
        values.length > 0 &&
        values.every((v) => v === 'Published');
      return {
        armId: arm.id,
        arm: arm.label,
        cells,
        ready:
          !published &&
          values.length > 0 &&
          values.every((v) => v === 'Approved' || v === 'Published') &&
          values.includes('Approved'),
        published,
      };
    });
    const scheme = sectionRow ? schemes.get(sectionRow.id) : undefined;
    return {
      term: term.name,
      section,
      sections: names,
      subjects: subjects.map(([, s]) => s),
      rows,
      counts,
      schemeMissing: !scheme,
      descriptive: scheme?.mode === 'DESCRIPTIVE',
    };
  }

  /* ---------------- One sheet ---------------- */

  /** The sheet of an arm × subject (code) in the term, created when missing. */
  async sheetFor(term: TermInfo, armId: string, code: string) {
    const arm = await this.core.catalog.arm(armId);
    if (!arm) throw AppException.notFound('Class not found', 'ARM_NOT_FOUND');
    const subject = await this.db.subject.findFirst({ where: { code } });
    if (!subject) throw AppException.notFound('Subject not found', 'SUBJECT_NOT_FOUND');
    const schemes = await this.core.schemes(term.sessionId);
    const scheme = schemes.get(arm.sectionId);
    if (!scheme)
      throw conflict(`Set up an assessment scheme for ${arm.section} first.`, 'NO_SCHEME');
    const offered = await this.core.catalog.offeredByLevel(term.sessionId);
    if (!offeredInArm(offered.get(arm.levelId), arm.id).some((s) => s.subjectId === subject.id))
      throw AppException.notFound(`${arm.label} doesn’t offer ${subject.name}.`, 'NOT_OFFERED');
    const [sheet] = await this.core.ensureSheets(term, [{ armId, subjectId: subject.id }]);
    if (!sheet) throw AppException.notFound('That sheet wasn’t found.', 'NOT_FOUND');
    return { arm, ctx: await this.core.context(sheet, term) };
  }

  async sheet(armId: string, code: string, termId?: string) {
    const term = await this.core.adminTerm(termId);
    const { ctx } = await this.sheetFor(term, armId, code);
    return this.core.adminView(ctx);
  }

  private async decidable(armId: string, code: string, termId?: string) {
    const term = await this.core.adminTerm(termId);
    await this.sections.requireArm(armId, 'results');
    const { arm, ctx } = await this.sheetFor(term, armId, code);
    const lock = TeacherScopeService.lockReason(term);
    if (lock) throw conflict(lock, 'TERM_LOCKED');
    return { term, arm, ctx };
  }

  private static requireWithOffice(ctx: SheetCtx) {
    const s = ctx.sheet;
    if (s.status === 'PUBLISHED')
      throw conflict('Published results are locked. Use a correction request.', 'SHEET_LOCKED');
    if (ResultsCoreService.withHod(s))
      throw conflict(
        `This sheet is with ${s.reviewer ? ResultsCoreService.hodLabel(ctx, s.reviewer) : 'the HOD'} for review. You can approve or return it once the HOD forwards it to the academic office.`,
        'WITH_HOD',
      );
    if (!ResultsCoreService.withOffice(s))
      throw conflict('Only a sheet under review can be approved or returned.', 'NOT_UNDER_REVIEW');
  }

  async approve(auth: AuthUserContext, armId: string, code: string, termId?: string) {
    const { arm, ctx } = await this.decidable(armId, code, termId);
    OfficeResultsService.requireWithOffice(ctx);
    const stats = statsOf(ctx.scheme, ctx.rows);
    if (stats.missing)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `${plural(stats.missing, 'student')} still ${stats.missing === 1 ? 'has' : 'have'} missing scores. Return the sheet to the teacher.`,
        'MISSING_SCORES',
      );
    const { sheet } = ctx;
    const staffId = await this.staffIdOf(auth);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: { status: 'APPROVED', approvedAt: this.core.now(), approvedById: auth.userId },
      });
      await this.core.event(tx, sheet, 'APPROVED', 'APPROVED', { userId: auth.userId, staffId });
      await this.core.notifyStaff(tx, [sheet.teacherStaffId], {
        category: 'results',
        title: 'The academic office approved your result sheet',
        body: `${arm.label} · ${sheet.subject.name} is approved. It’s published with the class’s results.`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.approve',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `Approved ${arm.label} ${sheet.subject.name}`,
          detail: ctx.term.name,
        },
        asTx(tx),
      );
    });
    return this.reload(ctx);
  }

  async returnSheet(
    auth: AuthUserContext,
    armId: string,
    code: string,
    note: unknown,
    termId?: string,
  ) {
    const { arm, ctx } = await this.decidable(armId, code, termId);
    OfficeResultsService.requireWithOffice(ctx);
    const text = typeof note === 'string' ? note.trim() : '';
    if (!text) throw AppException.validation({ note: 'Tell the teacher what to fix.' });
    const { sheet } = ctx;
    const staffId = await this.staffIdOf(auth);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({
        where: { id: sheet.id },
        data: {
          status: 'RETURNED',
          returnedBy: 'OFFICE',
          returnedAt: this.core.now(),
          returnNote: text,
        },
      });
      await this.core.event(
        tx,
        sheet,
        'RETURNED',
        'RETURNED',
        { userId: auth.userId, staffId },
        text,
      );
      await this.core.notifyStaff(tx, [sheet.teacherStaffId], {
        category: 'results',
        title: 'The academic office returned your result sheet',
        body: `${arm.label} · ${sheet.subject.name}: “${text}”`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.return',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `Returned ${arm.label} ${sheet.subject.name} to ${sheet.teacher ? `${sheet.teacher.firstName} ${sheet.teacher.lastName}` : 'the teacher'}`,
          detail: text,
        },
        asTx(tx),
      );
    });
    return this.reload(ctx);
  }

  /** Reopens entry on one sheet for N days after the term's deadline. */
  async reopen(auth: AuthUserContext, armId: string, code: string, days: number, termId?: string) {
    const { arm, ctx } = await this.decidable(armId, code, termId);
    const { sheet, term } = ctx;
    if (!['NOT_STARTED', 'DRAFT', 'RETURNED'].includes(sheet.status))
      throw conflict(
        `This sheet is ${STATUS_LABEL[sheet.status].toLowerCase()}, so there’s no entry to reopen.`,
        'SHEET_LOCKED',
      );
    if (!term.resultEntryClosesAt || !this.core.entryClosed(term))
      throw conflict(
        'Result entry is still open for this term, so there’s nothing to reopen.',
        'ENTRY_OPEN',
      );
    const until = new Date(this.core.now().getTime() + days * 86_400_000);
    const label = `Until ${fmtDate(TeacherScopeService.local(until).slice(0, 10), false)}, ${TeacherScopeService.local(until).slice(11, 16)}`;
    const staffId = await this.staffIdOf(auth);
    await this.db.$transaction(async (tx) => {
      await tx.resultSheet.update({ where: { id: sheet.id }, data: { entryReopenedUntil: until } });
      await this.core.event(
        tx,
        sheet,
        'REOPENED',
        sheet.status,
        { userId: auth.userId, staffId },
        label,
      );
      await this.core.notifyStaff(tx, [sheet.teacherStaffId, ...ctx.teacherIds], {
        category: 'results',
        title: 'Result entry reopened for your sheet',
        body: `${arm.label} · ${sheet.subject.name} is open for entry ${label.toLowerCase()}.`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.reopen',
          area: 'Academic',
          entity: 'ResultSheet',
          entityId: sheet.id,
          summary: `Reopened entry for ${arm.label} ${sheet.subject.name}`,
          detail: `${plural(days, 'day')} · ${label}`,
        },
        asTx(tx),
      );
    });
    return this.reload(ctx);
  }

  private async reload(ctx: SheetCtx) {
    const sheet = await this.core.sheetById(ctx.sheet.id);
    return this.core.adminView(await this.core.context(sheet, ctx.term));
  }

  /* ---------------- Sidebar ---------------- */

  /** Sheets this term waiting on the academic office (not yet published). */
  async waitingOnOffice() {
    const found = await this.core.catalog.termFrom();
    if (!found?.term) return 0;
    const mine = await this.sections.mine();
    let arms: ArmInfo[] | null = null;
    if (mine) arms = (await this.core.catalog.arms()).filter((a) => mine.has(a.sectionId));
    return this.db.resultSheet.count({
      where: {
        termId: found.term.id,
        OR: [{ status: 'UNDER_REVIEW' }, { status: 'SUBMITTED', reviewerStaffId: null }],
        ...(arms && { armId: { in: arms.map((a) => a.id) } }),
      },
    });
  }
}
