import { Injectable } from '@nestjs/common';
import type { SheetStatus } from '../../generated/prisma/enums.js';
import { offeredInArm, type ArmInfo } from '../academics/academic-catalog.service.js';
import {
  ResultsCoreService,
  SHEET_INCLUDE,
  STATUS_LABEL,
  type SheetCtx,
} from '../results/results-core.service.js';

/** One subject sheet a class arm is due for this term, whether or not it was started. */
export interface SheetCell {
  arm: ArmInfo;
  subjectId: string;
  code: string;
  name: string;
  status: SheetStatus;
  /** "Not started", "Under review"… as the Results screen shows it. */
  label: string;
  withOffice: boolean;
  withHod: boolean;
}

const DONE: SheetStatus[] = ['APPROVED', 'PUBLISHED'];

/**
 * Result-sheet figures the dashboard and reports share, read the same way as Academics › Results:
 * one sheet per subject a class arm offers, approved and published sheets' scores through the
 * results core (so totals and grades match the review screens).
 */
@Injectable()
export class InsightsResultsService {
  constructor(private readonly core: ResultsCoreService) {}

  private get db() {
    return this.core.db;
  }

  /** Live arms at the branch (all branches for null), optionally of one section. */
  async arms(branchId: string | null, section?: string | null) {
    const arms = await this.core.catalog.arms(branchId);
    return section ? arms.filter((a) => a.section === section) : arms;
  }

  /** Every offered subject sheet of the arms for the term, with its status. */
  async cells(term: { id: string; sessionId: string }, arms: ArmInfo[]): Promise<SheetCell[]> {
    if (!arms.length) return [];
    const [offered, sheets] = await Promise.all([
      this.core.catalog.offeredByLevel(term.sessionId),
      this.db.resultSheet.findMany({
        where: { termId: term.id, armId: { in: arms.map((a) => a.id) } },
        select: { armId: true, subjectId: true, status: true, reviewerStaffId: true },
      }),
    ]);
    const byKey = new Map(sheets.map((s) => [`${s.armId}|${s.subjectId}`, s]));
    return arms.flatMap((arm) =>
      offeredInArm(offered.get(arm.levelId), arm.id).map((s) => {
        const sheet = byKey.get(`${arm.id}|${s.subjectId}`);
        const status: SheetStatus = sheet?.status ?? 'NOT_STARTED';
        return {
          arm,
          subjectId: s.subjectId,
          code: s.code,
          name: s.name,
          status,
          label: STATUS_LABEL[status],
          withOffice: !!sheet && ResultsCoreService.withOffice(sheet),
          withHod: !!sheet && ResultsCoreService.withHod(sheet),
        };
      }),
    );
  }

  /** The session's assessment schemes, by section id. */
  schemes(sessionId: string) {
    return this.core.schemes(sessionId);
  }

  /**
   * Approved and published sheets of the arms for the term, with their students' totals and
   * grades. Only sections that use scores (descriptive ratings have no totals).
   */
  async approved(term: { id: string }, arms: ArmInfo[]): Promise<SheetCtx[]> {
    if (!arms.length) return [];
    const sheets = await this.db.resultSheet.findMany({
      where: { termId: term.id, armId: { in: arms.map((a) => a.id) }, status: { in: DONE } },
      include: SHEET_INCLUDE,
    });
    const info = await this.core.term(term.id);
    const ctxs = await this.core.contexts(sheets, info);
    return ctxs.filter((c) => c.scheme.mode === 'SCORES');
  }
}
