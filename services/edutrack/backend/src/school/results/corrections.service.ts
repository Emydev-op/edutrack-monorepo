import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { parseSupportAttachment } from '../../platform/support/support-desk.js';
import { isUuid } from '../../platform/shared/params.js';
import { StorageService } from '../../storage/storage.service.js';
import { staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';
import { PublishingService } from './publishing.service.js';
import { conflict, ResultsCoreService, SHEET_INCLUDE, stamp } from './results-core.service.js';
import { isValidScore, scoreRow, storedValue, toStored, valueLabel } from './scoring.js';

export interface CorrectionInput {
  sheetId?: string;
  studentId?: string;
  componentKey?: string;
  proposed?: unknown;
  reason?: string;
  evidence?: { name?: string; size?: number; type?: string; dataUrl?: string } | null;
}

const EVIDENCE = { include: { evidenceFile: { select: { originalName: true } } } } as const;

/**
 * Corrections to published scores, one store for both portals: a teacher on the sheet asks
 * (reason and optional evidence, PDF or photo up to 10 MB); the academic office applies it (the
 * score changes, totals and positions are recomputed and the student's report card is re-issued
 * as the next version) or rejects it with a note.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly scope: TeacherScopeService,
    private readonly publishing: PublishingService,
    private readonly sections: SectionAccessService,
    private readonly storage: StorageService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }

  /** Correction views for any corrections, grouped through their sheets. */
  private async views(list: Awaited<ReturnType<CorrectionsService['find']>>) {
    if (!list.length) return [];
    const sheets = await this.db.resultSheet.findMany({
      where: { id: { in: [...new Set(list.map((c) => c.sheetId))] } },
      include: SHEET_INCLUDE,
    });
    const byTerm = new Map<string, typeof sheets>();
    for (const s of sheets) byTerm.set(s.termId, [...(byTerm.get(s.termId) ?? []), s]);
    const out = new Map<
      string,
      Awaited<ReturnType<ResultsCoreService['correctionViews']>>[number]
    >();
    for (const group of byTerm.values()) {
      const ctxs = await this.core.contexts(group);
      for (const ctx of ctxs) {
        const views = await this.core.correctionViews(
          ctx,
          list.filter((c) => c.sheetId === ctx.sheet.id),
        );
        for (const v of views) out.set(v.id, v);
      }
    }
    return list.map((c) => out.get(c.id)).filter((v) => !!v);
  }

  private find(where: Prisma.ScoreCorrectionWhereInput) {
    return this.db.scoreCorrection.findMany({
      where,
      ...EVIDENCE,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /* ---------------- Teacher Workspace ---------------- */

  /** My correction requests for a term, newest first. */
  async mine(staffId: string, termId: string) {
    return this.views(await this.find({ requestedByStaffId: staffId, sheet: { termId } }));
  }

  async list(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    return this.mine(s.id, term.id);
  }

  async getMine(auth: AuthUserContext, id: string) {
    const s = await this.scope.staff(auth);
    const c = isUuid(id) ? (await this.find({ id }))[0] : undefined;
    if (!c) throw AppException.notFound('That correction wasn’t found.', 'NOT_FOUND');
    if (c.requestedByStaffId !== s.id)
      throw AppException.forbidden('You don’t have access to that correction request.');
    return (await this.views([c]))[0]!;
  }

  async request(auth: AuthUserContext, body: CorrectionInput) {
    const s = await this.scope.staff(auth);
    const sheetId = String(body.sheetId ?? '');
    if (!isUuid(sheetId)) throw AppException.notFound('That sheet wasn’t found.', 'NOT_FOUND');
    const sheet = await this.core.sheetById(sheetId);
    const ctx = await this.core.context(sheet);
    if (!ctx.teacherIds.includes(s.id))
      throw AppException.forbidden(
        `You don’t have access to the ${ctx.arm.label} · ${sheet.subject.name} sheet.`,
      );
    if (sheet.status !== 'PUBLISHED')
      throw conflict(
        'Corrections are for published results. Edit the sheet instead while it’s yours to change.',
        'SHEET_LOCKED',
      );
    const { scheme } = ctx;
    const fields: Record<string, string> = {};
    const row = ctx.rows.find((r) => r.studentId === body.studentId);
    if (!row) fields.studentId = 'Choose a student on this sheet.';
    const index = scheme.components.findIndex((c) => c.key === body.componentKey);
    if (index < 0) fields.componentKey = 'Choose a component.';
    const comp = scheme.components[index];
    const original = row && comp ? row.scores[index] : undefined;
    if (row && comp && (original === null || original === undefined))
      fields.componentKey = `${row.name} has no score for ${comp.name}, so there’s nothing to correct.`;
    // A score (e.g. after a make-up test for an absent student), or ABS / EXM.
    const proposed = body.proposed;
    if (comp) {
      const ok =
        proposed === 'ABS' ||
        proposed === 'EXM' ||
        (typeof proposed === 'number' && isValidScore(proposed, comp.max));
      if (!ok)
        fields.proposed = `Enter a score from 0 to ${comp.max} (one decimal place at most), or ABS or EXM.`;
      else if (proposed === original)
        fields.proposed = 'The new value must differ from the current one.';
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 15)
      fields.reason = 'Explain the correction in 15 characters or more (e.g. what was re-marked).';
    else if (reason.length > 600) fields.reason = 'Keep the reason under 600 characters.';
    let file: ReturnType<typeof parseSupportAttachment> | null = null;
    const evidence = body.evidence;
    const fileName = (evidence?.name ?? '').trim();
    if (evidence) {
      if (!evidence.dataUrl || !fileName)
        fields.evidence = 'The evidence file didn’t upload. Attach it again.';
      else
        try {
          file = parseSupportAttachment(evidence.dataUrl);
        } catch (e) {
          fields.evidence =
            e instanceof AppException && e.code === 'ATTACHMENT_TOO_LARGE'
              ? 'The evidence file must be 10 MB or smaller.'
              : 'Attach a PDF or a photo (JPG or PNG).';
        }
    }
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Check the highlighted fields.');
    const duplicate = await this.db.scoreCorrection.findFirst({
      where: { sheetId, studentId: row!.studentId, componentId: comp!.id, status: 'UNDER_REVIEW' },
    });
    if (duplicate)
      throw conflict(
        `There’s already an open correction for ${row!.name} · ${comp!.name} (requested ${stamp(duplicate.requestedAt)}). Wait for the academic office to decide it.`,
        'DUPLICATE',
      );
    const schoolId = ResultsCoreService.schoolId();
    const now = this.core.now();
    let fileId: string | null = null;
    if (file) {
      fileId = randomUUID();
      await this.storage.upload(
        `schools/${schoolId}/corrections/${fileId}.${file.ext}`,
        file.bytes,
        file.mime,
      );
    }
    const created = await this.db.$transaction(async (tx) => {
      if (file && fileId)
        await tx.storedFile.create({
          data: {
            id: fileId,
            schoolId,
            storageKey: `schools/${schoolId}/corrections/${fileId}.${file.ext}`,
            originalName: fileName,
            mimeType: file.mime,
            sizeBytes: BigInt(file.bytes.length),
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            uploadedById: auth.userId,
          },
        });
      const c = await tx.scoreCorrection.create({
        data: {
          schoolId,
          sheetId,
          studentId: row!.studentId,
          componentId: comp!.id,
          originalState: toStored(original as number | 'ABS' | 'EXM').state,
          originalScore: toStored(original as number | 'ABS' | 'EXM').score,
          proposedState: toStored(proposed as number | 'ABS' | 'EXM').state,
          proposedScore: toStored(proposed as number | 'ABS' | 'EXM').score,
          reason,
          evidenceFileId: fileId,
          requestedById: auth.userId,
          requestedByStaffId: s.id,
          requestedAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'results.correction_request',
          area: 'Academic',
          entity: 'ScoreCorrection',
          entityId: c.id,
          summary: `Correction requested by ${staffName(s)}`,
          detail: `${row!.name} · ${ctx.arm.label} ${sheet.subject.name} · ${comp!.name} ${valueLabel(original as number)} → ${valueLabel(proposed as number)}`,
        },
        asTx(tx),
      );
      return c;
    });
    return (await this.views(await this.find({ id: created.id })))[0]!;
  }

  /* ---------------- School Admin ---------------- */

  async adminList() {
    return this.views(await this.find({}));
  }

  private async decidable(id: string) {
    const c = isUuid(id) ? (await this.find({ id }))[0] : undefined;
    if (!c) throw AppException.notFound('Correction not found', 'NOT_FOUND');
    const sheet = await this.core.sheetById(c.sheetId);
    await this.sections.requireArm(sheet.armId, 'results');
    if (c.status !== 'UNDER_REVIEW')
      throw conflict('This correction has already been decided.', 'ALREADY_DECIDED');
    return { c, sheet };
  }

  async approve(auth: AuthUserContext, id: string, note?: string) {
    const { c, sheet } = await this.decidable(id);
    const ctx = await this.core.context(sheet);
    const comp = ctx.scheme.components.find((x) => x.id === c.componentId)!;
    const entry = ctx.entries.get(c.studentId);
    const row = ctx.rows.find((r) => r.studentId === c.studentId);
    if (!entry || !row || !comp)
      throw conflict('This student’s score is no longer on the sheet.', 'NOT_ON_SHEET');
    const index = ctx.scheme.components.indexOf(comp);
    const from = storedValue(c.originalState, c.originalScore);
    const to = storedValue(c.proposedState, c.proposedScore);
    const values = row.scores.map((v, i) => (i === index ? to : v));
    const r = scoreRow(ctx.scheme, values);
    const now = this.core.now();
    const summary = `${row.name} · ${comp.name} ${valueLabel(from)} → ${valueLabel(to)}`;
    await this.db.$transaction(async (tx) => {
      await tx.resultScore.deleteMany({ where: { entryId: entry.id, componentId: comp.id } });
      await tx.resultScore.create({
        data: {
          schoolId: ResultsCoreService.schoolId(),
          entryId: entry.id,
          componentId: comp.id,
          state: c.proposedState,
          score: c.proposedState === 'SCORED' ? Number(c.proposedScore) : null,
        },
      });
      await tx.resultEntry.update({
        where: { id: entry.id },
        data: { total: r.total, grade: r.grade },
      });
      await tx.scoreCorrection.update({
        where: { id: c.id },
        data: {
          status: 'APPLIED',
          decidedById: auth.userId,
          decidedAt: now,
          decisionNote: note?.trim() || null,
        },
      });
      await this.core.event(
        tx,
        sheet,
        'CORRECTION_APPLIED',
        sheet.status,
        { userId: auth.userId },
        summary,
      );
      await this.core.notifyStaff(tx, [c.requestedByStaffId], {
        category: 'results',
        title: 'Your correction was approved',
        body: `${ctx.arm.label} · ${sheet.subject.name}: ${summary}. The report card is re-issued.`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.correction_apply',
          area: 'Academic',
          entity: 'ScoreCorrection',
          entityId: c.id,
          summary: `Correction applied for ${row.name}`,
          detail: `${sheet.subject.name} · ${valueLabel(from)} → ${valueLabel(to)}`,
        },
        asTx(tx),
      );
    });
    // Totals changed: positions and the student's report card follow.
    await this.publishing.refreshAfterCorrection(sheet.termId, sheet.armId, c.studentId);
    return (await this.views(await this.find({ id: c.id })))[0]!;
  }

  async reject(auth: AuthUserContext, id: string, note?: string) {
    const { c, sheet } = await this.decidable(id);
    const text = (note ?? '').trim();
    if (!text) throw AppException.validation({ note: 'Give a reason so the teacher knows why.' });
    const arm = await this.core.catalog.arm(sheet.armId);
    await this.db.$transaction(async (tx) => {
      await tx.scoreCorrection.update({
        where: { id: c.id },
        data: {
          status: 'REJECTED',
          decidedById: auth.userId,
          decidedAt: this.core.now(),
          decisionNote: text,
        },
      });
      await this.core.notifyStaff(tx, [c.requestedByStaffId], {
        category: 'results',
        title: 'Your correction wasn’t approved',
        body: `${arm?.label ?? 'Your class'} · ${sheet.subject.name}: “${text}”`,
        link: `/results/${sheet.id}`,
        sheetId: sheet.id,
      });
      await this.audit.record(
        {
          action: 'results.correction_reject',
          area: 'Academic',
          entity: 'ScoreCorrection',
          entityId: c.id,
          summary: 'Correction rejected',
          detail: text,
        },
        asTx(tx),
      );
    });
    return (await this.views(await this.find({ id: c.id })))[0]!;
  }
}
