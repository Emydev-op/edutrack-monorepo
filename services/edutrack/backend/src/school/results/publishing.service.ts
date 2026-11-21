import { StudentPhotoService } from '../students/student-photo.service.js';
import { pdfName, reportCardPdf, type ReportCardDoc } from '../../common/pdf/school-documents.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import { plural } from '../academics/academic-format.js';
import { CommsDispatchService } from '../communication/comms-dispatch.service.js';
import { outstandingBalances } from '../finance/finance-balances.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { ReportCardsService } from './report-cards.service.js';
import {
  conflict,
  ResultsCoreService,
  STATUS_LABEL,
  type TermInfo,
} from './results-core.service.js';

/**
 * Publishing an arm's results for a term (every subject approved, absent and exempt flags
 * acknowledged; missing remarks only warn): sheets become Published, subject and class positions
 * are stored, report cards are frozen with a snapshot, the assessment scheme locks, and teachers
 * and guardians are told. Also School Admin's report card, and withholding a card.
 */
@Injectable()
export class PublishingService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly cards: ReportCardsService,
    private readonly scope: TeacherScopeService,
    private readonly sections: SectionAccessService,
    private readonly audit: SchoolAuditService,
    private readonly comms: CommsDispatchService,
    private readonly photos: StudentPhotoService,
  ) {}

  private get db() {
    return this.core.db;
  }

  private async arm(armId: string) {
    const arm = await this.core.catalog.arm(armId);
    if (!arm) throw AppException.notFound('Class not found', 'ARM_NOT_FOUND');
    return arm;
  }

  /* ---------------- Publish check ---------------- */

  private async checkFor(term: TermInfo, arm: ArmInfo) {
    const [subjects, sheets, roll, remarks] = await Promise.all([
      this.cards.armSubjects(term, arm),
      this.db.resultSheet.findMany({
        where: { termId: term.id, armId: arm.id },
        select: { id: true, subjectId: true, status: true, reviewerStaffId: true },
      }),
      this.db.enrollment.findMany({
        where: { sessionId: term.sessionId, armId: arm.id, status: 'ACTIVE' },
        select: { studentId: true },
      }),
      this.db.reportCard.findMany({
        where: { termId: term.id, armId: arm.id, classTeacherRemark: { not: null } },
        select: { studentId: true },
      }),
    ]);
    const notApproved: string[] = [];
    const approvedIds: string[] = [];
    let published = 0;
    for (const s of subjects) {
      const sheet = sheets.find((x) => x.subjectId === s.subjectId);
      if (sheet?.status === 'APPROVED') approvedIds.push(sheet.id);
      else if (sheet?.status === 'PUBLISHED') published++;
      else
        notApproved.push(
          `${s.name} (${sheet && ResultsCoreService.withHod(sheet) ? 'with HOD' : STATUS_LABEL[sheet?.status ?? 'NOT_STARTED'].toLowerCase()})`,
        );
    }
    const flags: string[] = [];
    if (approvedIds.length) {
      const results = await this.cards.armResults(term, arm);
      for (const ctx of results.sheets.filter((c) => approvedIds.includes(c.sheet.id)))
        for (const r of ctx.rows)
          if (r.flag) flags.push(`${r.name} · ${ctx.sheet.subject.name}: ${r.flag}`);
    }
    const written = new Set(remarks.map((r) => r.studentId));
    const missingRemarks = roll.filter((e) => !written.has(e.studentId)).length;
    const classTeacher = await this.scope.classTeacherOf(arm.id, term);
    return {
      armId: arm.id,
      arm: arm.label,
      students: roll.length,
      subjects: subjects.length,
      notApproved,
      flags,
      missingRemarks,
      warnings: missingRemarks
        ? [
            `${arm.label}: ${plural(missingRemarks, 'report card')} ${missingRemarks === 1 ? 'has' : 'have'} no class teacher’s remark yet${classTeacher ? ` (${classTeacher.name})` : ' · the arm has no class teacher'}.`,
          ]
        : [],
      allPublished: subjects.length > 0 && published === subjects.length,
      approved: approvedIds.length,
    };
  }

  async check(armId: string, termId?: string) {
    const term = await this.core.adminTerm(termId);
    const {
      allPublished: _a,
      approved: _b,
      ...check
    } = await this.checkFor(term, await this.arm(armId));
    return check;
  }

  /* ---------------- Publish ---------------- */

  async publish(
    auth: AuthUserContext,
    armId: string,
    body: { acknowledged?: boolean; term?: string },
  ) {
    const term = await this.core.adminTerm(body.term);
    const arm = await this.arm(armId);
    await this.sections.requireArm(armId, 'results');
    if (term.status === 'CLOSED' || term.status === 'UPCOMING')
      throw conflict(
        TeacherScopeService.lockReason({ ...term }) ?? `${term.name} is read-only.`,
        'TERM_LOCKED',
      );
    const check = await this.checkFor(term, arm);
    if (check.allPublished)
      throw conflict('These results are already published.', 'ALREADY_PUBLISHED');
    if (!check.subjects)
      throw conflict(
        `${arm.label} takes no subjects this session, so there’s nothing to publish.`,
        'NOTHING_TO_PUBLISH',
      );
    if (check.notApproved.length)
      throw conflict(
        `Approve every subject first: ${check.notApproved.join(', ')}.`,
        'NOT_APPROVED',
      );
    if (check.flags.length && !body.acknowledged)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Acknowledge the absent and exempt flags before publishing.',
        'FLAGS_UNACKNOWLEDGED',
      );
    const now = this.core.now();
    const staff = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId },
      select: { staffId: true },
    });
    const { results, cards } = await this.cards.cards(term, arm);
    const existing = await this.db.reportCard.findMany({
      where: { termId: term.id, studentId: { in: results.students.map((s) => s.student.id) } },
    });
    const classTeacher = await this.scope.classTeacherOf(arm.id, term);
    let flush: () => Promise<void> = () => Promise.resolve();
    await this.db.$transaction(
      async (tx) => {
        // Settings › Finance "Hold report cards with unpaid fees": students who owe anything are
        // held now (not already held ones), and their guardians aren't told until released.
        const holdOn = await tx.financeSettings.findFirst({ select: { holdReportCards: true } });
        const owed = holdOn?.holdReportCards
          ? await outstandingBalances(
              tx,
              results.students
                .map((s) => s.student.id)
                .filter((id) => !existing.find((c) => c.studentId === id)?.heldAt),
            )
          : new Map<string, number>();
        const feeHolds = new Map([...owed].filter(([, n]) => n > 0));
        for (const ctx of results.sheets) {
          if (ctx.sheet.status !== 'APPROVED') continue;
          await tx.resultSheet.update({
            where: { id: ctx.sheet.id },
            data: { status: 'PUBLISHED', publishedAt: now },
          });
          await this.core.event(tx, ctx.sheet, 'PUBLISHED', 'PUBLISHED', {
            userId: auth.userId,
            staffId: staff?.staffId ?? null,
          });
        }
        await this.storePositions(tx, results);
        await tx.resultPublication.upsert({
          where: { termId_armId: { termId: term.id, armId: arm.id } },
          create: {
            schoolId: ResultsCoreService.schoolId(),
            termId: term.id,
            armId: arm.id,
            publishedAt: now,
            publishedById: auth.userId,
          },
          update: { version: { increment: 1 }, publishedAt: now, publishedById: auth.userId },
        });
        for (const r of results.students) {
          const prev = existing.find((c) => c.studentId === r.student.id);
          const version = (prev?.version ?? 0) + 1;
          const card = cards.get(r.student.id);
          const snapshot = (card
            ? { ...card, published: true, version }
            : null) as unknown as Prisma.InputJsonValue;
          const owes = feeHolds.get(r.student.id);
          const data = {
            ...(owes !== undefined && {
              heldAt: now,
              heldReason: `Unpaid fees: ₦${Math.round(owes).toLocaleString('en-NG')} outstanding`,
              heldById: auth.userId,
            }),
            armId: arm.id,
            classTeacherStaffId: prev?.classTeacherStaffId ?? classTeacher?.id ?? null,
            average: r.average,
            grade: r.grade,
            position: r.position,
            version,
            publishedAt: now,
            snapshot,
          };
          if (prev) await tx.reportCard.update({ where: { id: prev.id }, data });
          else
            await tx.reportCard.create({
              data: {
                schoolId: ResultsCoreService.schoolId(),
                termId: term.id,
                studentId: r.student.id,
                ...data,
              },
            });
        }
        if (results.scheme && !results.scheme.lockedAt)
          await tx.assessmentScheme.update({
            where: { id: results.scheme.id },
            data: { lockedAt: now },
          });
        const subjectTeachers = results.sheets.flatMap((c) => c.teacherIds);
        await this.core.notifyStaff(tx, subjectTeachers, {
          category: 'results',
          title: `${arm.label} ${term.name} results are published`,
          body: 'Your sheets for the class are published to students and guardians. To change a score now, request a correction.',
          link: '/results',
        });
        await this.core.notifyStaff(tx, [classTeacher?.id], {
          category: 'results',
          title: `${arm.label} report cards are published`,
          body: `${term.name} report cards for your class are out. Remarks and ratings are now read-only.`,
          link: '/my-class/report-cards',
        });
        const held = new Set([
          ...existing.filter((c) => c.heldAt).map((c) => c.studentId),
          ...feeHolds.keys(),
        ]);
        flush = await this.notifyGuardians(
          tx,
          results.students.map((s) => s.student.id).filter((id) => !held.has(id)),
          term,
          false,
          arm.label,
        );
        await this.audit.record(
          {
            action: 'results.publish',
            area: 'Academic',
            entity: 'ResultPublication',
            entityId: arm.id,
            summary: `Published ${arm.label} results`,
            detail: `${term.name} · ${plural(check.students, 'student')}${held.size ? ` · ${plural(held.size, 'report card')} on hold` : ''}${feeHolds.size ? ` (${plural(feeHolds.size, 'for unpaid fees', 'for unpaid fees')})` : ''}`,
          },
          asTx(tx),
        );
      },
      { timeout: 30_000 },
    );
    // Email and SMS to guardians go out once the publication is saved.
    await flush();
    const { allPublished: _a, approved: _b, ...after } = await this.checkFor(term, arm);
    return after;
  }

  /** Stores each student's subject positions on their result entries. */
  private async storePositions(
    tx: TenantTx,
    results: Awaited<ReturnType<ReportCardsService['armResults']>>,
  ) {
    for (const ctx of results.sheets)
      for (const r of results.students) {
        const subj = r.subjects.find((s) => s.sheetId === ctx.sheet.id);
        const entry = ctx.entries.get(r.student.id);
        if (!subj || !entry || entry.position === subj.position) continue;
        await tx.resultEntry.update({ where: { id: entry.id }, data: { position: subj.position } });
      }
  }

  /**
   * Tells the guardians of these students their report card is ready, through the school's
   * Communication settings (the "Result published" event: switch, channels, wording). A
   * correction is an in-app notice only. Returns what sends email and SMS after the commit.
   */
  private async notifyGuardians(
    tx: TenantTx,
    studentIds: string[],
    term: TermInfo,
    corrected = false,
    armLabel = '',
  ): Promise<() => Promise<void>> {
    const none = () => Promise.resolve();
    if (!studentIds.length) return none;
    const links = await tx.studentGuardian.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        student: { select: { id: true, firstName: true, surname: true } },
        guardian: {
          select: {
            id: true,
            title: true,
            fullName: true,
            email: true,
            phone: true,
            membership: { select: { userId: true, status: true } },
          },
        },
      },
    });
    const schoolId = ResultsCoreService.schoolId();
    const userOf = (l: (typeof links)[number]) =>
      l.guardian.membership?.status === 'ACTIVE' ? l.guardian.membership.userId : null;
    if (corrected) {
      for (const l of links) {
        const userId = userOf(l);
        if (!userId) continue;
        await tx.notification.create({
          data: {
            userId,
            schoolId,
            category: 'results',
            title: `${l.student.firstName}’s ${term.name} report card was updated`,
            body: `A corrected score was applied to ${l.student.firstName} ${l.student.surname}’s ${term.name} results. The report card shows the new version.`,
            link: '/results',
            entityType: 'Student',
            entityId: l.student.id,
            createdAt: this.core.now(),
          },
        });
      }
      return none;
    }
    const guardian = (g: { title: string | null; fullName: string }) =>
      [g.title, g.fullName].filter(Boolean).join(' ');
    const sent = await this.comms.dispatch(asTx(tx), schoolId, {
      event: 'result.published',
      title: `${term.name} report cards · ${armLabel || 'results'}`,
      audienceLabel:
        links.length === 1
          ? guardian(links[0]!.guardian)
          : `${links.length} guardians${armLabel ? ` · ${armLabel}` : ''}`,
      recipients: links.map((l) => ({
        key: `${l.guardianId}#${l.studentId}`,
        role: 'PARENT' as const,
        name: guardian(l.guardian),
        userId: userOf(l),
        guardianId: l.guardianId,
        studentId: l.studentId,
        email: l.guardian.email,
        phone: l.guardian.phone,
        vars: {
          parent_name: guardian(l.guardian),
          student_name: `${l.student.firstName} ${l.student.surname}`,
          first_name: l.student.firstName,
          term: term.name,
          session: term.session.name,
          class: armLabel,
        },
        entity: { type: 'Student', id: l.student.id },
      })),
      createdById: RequestContext.get()?.userId ?? null,
      source: { type: 'ResultPublication', id: studentIds[0]! },
      inApp: { category: 'results', link: '/results' },
    });
    return sent.flush;
  }

  /**
   * After a correction on a published sheet: re-store positions and averages for the arm and
   * re-issue the student's report card as the next version.
   */
  async refreshAfterCorrection(termId: string, armId: string, studentId: string) {
    const term = await this.core.term(termId);
    const arm = await this.arm(armId);
    const { results, cards: views } = await this.cards.cards(term, arm, studentId);
    const cards = await this.db.reportCard.findMany({ where: { termId, armId } });
    await this.db.$transaction(async (tx) => {
      await this.storePositions(tx, results);
      await this.reissue(tx, term, results, cards, views, studentId);
    });
  }

  private async reissue(
    tx: TenantTx,
    term: TermInfo,
    results: Awaited<ReturnType<ReportCardsService['armResults']>>,
    cards: Prisma.ReportCardGetPayload<object>[],
    views: Map<string, unknown>,
    studentId: string,
  ) {
    for (const r of results.students) {
      const card = cards.find((c) => c.studentId === r.student.id);
      if (!card?.publishedAt) continue;
      const mine = r.student.id === studentId;
      const version = mine ? card.version + 1 : card.version;
      const view = mine ? (views.get(studentId) as Record<string, unknown> | undefined) : null;
      await tx.reportCard.update({
        where: { id: card.id },
        data: {
          average: r.average,
          grade: r.grade,
          position: r.position,
          ...(mine && {
            version,
            publishedAt: this.core.now(),
            snapshot: (view ? { ...view, version } : card.snapshot) as Prisma.InputJsonValue,
          }),
        },
      });
      if (mine && !card.heldAt) await this.notifyGuardians(tx, [studentId], term, true);
    }
  }

  /* ---------------- Report card ---------------- */

  private async studentArm(studentId: string, term: TermInfo) {
    const student = await this.db.student.findFirst({ where: { id: studentId } });
    if (!student) throw AppException.notFound('Student not found', 'STUDENT_NOT_FOUND');
    const card = await this.db.reportCard.findFirst({ where: { termId: term.id, studentId } });
    const enrollment = card
      ? null
      : await this.db.enrollment.findFirst({
          where: { sessionId: term.sessionId, studentId, armId: { not: null } },
          orderBy: { createdAt: 'desc' },
        });
    const armId = card?.armId ?? enrollment?.armId ?? null;
    const arm = armId ? await this.core.catalog.arm(armId) : null;
    if (!arm)
      throw conflict(
        `${student.firstName} ${student.surname} isn’t placed in a class arm.`,
        'NOT_PLACED',
      );
    return { student, arm };
  }

  async reportCard(studentId: string, termId?: string) {
    const term = await this.core.adminTerm(termId);
    const { arm } = await this.studentArm(studentId, term);
    const schemes = await this.core.schemes(term.sessionId);
    if (!schemes.get(arm.sectionId))
      throw conflict(`Set up an assessment scheme for ${arm.section} first.`, 'NO_SCHEME');
    const { cards } = await this.cards.cards(term, arm, studentId);
    const card = cards.get(studentId);
    if (!card)
      throw conflict('This student has no report card in the class yet.', 'NO_REPORT_CARD');
    return { ...card, student: { ...card.student, photoUrl: await this.photos.url(studentId) } };
  }

  /** The report card as a PDF; before publishing it prints as a preview. */
  async reportCardPdf(studentId: string, termId?: string) {
    const card = await this.reportCard(studentId, termId);
    const file = await reportCardPdf(
      { ...(card as unknown as ReportCardDoc), preview: !card.published },
      await this.photos.bytes(studentId),
    );
    return { file, name: pdfName(`${card.student.name} ${card.title}`) };
  }

  async hold(auth: AuthUserContext, studentId: string, body: { term?: string; reason?: string }) {
    const term = await this.core.adminTerm(body.term);
    const { student, arm } = await this.studentArm(studentId, term);
    await this.sections.requireArm(arm.id, 'report cards');
    const reason = (body.reason ?? '').trim();
    if (reason.length < 5)
      throw AppException.validation({ reason: 'Give a reason for holding this report card.' });
    if (reason.length > 300)
      throw AppException.validation({ reason: 'Keep the reason to 300 characters.' });
    const existing = await this.db.reportCard.findFirst({ where: { termId: term.id, studentId } });
    if (existing?.heldAt) throw conflict('This report card is already on hold.', 'ALREADY_HELD');
    const name = `${student.firstName} ${student.surname}`;
    await this.db.$transaction(async (tx) => {
      const data = { heldAt: this.core.now(), heldReason: reason, heldById: auth.userId };
      if (existing) await tx.reportCard.update({ where: { id: existing.id }, data });
      else
        await tx.reportCard.create({
          data: {
            schoolId: ResultsCoreService.schoolId(),
            termId: term.id,
            studentId,
            armId: arm.id,
            ...data,
          },
        });
      await this.audit.record(
        {
          action: 'results.hold',
          area: 'Academic',
          entity: 'ReportCard',
          entityId: studentId,
          summary: `Held ${name}’s ${term.name} report card`,
          detail: reason,
        },
        asTx(tx),
      );
    });
    return this.reportCard(studentId, term.id);
  }

  async release(studentId: string, body: { term?: string }) {
    const term = await this.core.adminTerm(body.term);
    const { student, arm } = await this.studentArm(studentId, term);
    await this.sections.requireArm(arm.id, 'report cards');
    const existing = await this.db.reportCard.findFirst({ where: { termId: term.id, studentId } });
    if (!existing?.heldAt) throw conflict('This report card isn’t on hold.', 'NOT_HELD');
    const name = `${student.firstName} ${student.surname}`;
    let flush: () => Promise<void> = () => Promise.resolve();
    await this.db.$transaction(async (tx) => {
      await tx.reportCard.update({
        where: { id: existing.id },
        data: { heldAt: null, heldReason: null, heldById: null },
      });
      // Released after publishing: the guardians hear about it now.
      if (existing.publishedAt)
        flush = await this.notifyGuardians(tx, [studentId], term, false, arm.label);
      await this.audit.record(
        {
          action: 'results.release',
          area: 'Academic',
          entity: 'ReportCard',
          entityId: studentId,
          summary: `Released ${name}’s ${term.name} report card`,
        },
        asTx(tx),
      );
    });
    await flush();
    return this.reportCard(studentId, term.id);
  }
}
