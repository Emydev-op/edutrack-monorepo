import type { TenantTx } from '../shared/tenant-tx.js';

/** A session's classes for promotion: a class level at a branch, keyed `<levelId>~<branchId>`. */
export interface PromotionProgress {
  /** Classes with students who finished the session (not those who left during it). */
  classes: number;
  /** Classes whose decisions are applied: every student has an outcome. */
  applied: number;
}

/**
 * How far promotion has got for a session. A class counts once every student still on its roll
 * (or who finished the year in it) has an outcome; students who left mid-session don't count.
 */
export async function promotionProgress(
  db: Pick<TenantTx, 'enrollment'>,
  sessionId: string,
): Promise<PromotionProgress> {
  const rows = await db.enrollment.findMany({
    where: { sessionId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    select: { levelId: true, branchId: true, outcome: true },
  });
  const open = new Map<string, boolean>();
  for (const r of rows) {
    const key = `${r.levelId}~${r.branchId}`;
    open.set(key, (open.get(key) ?? false) || r.outcome === null);
  }
  return { classes: open.size, applied: [...open.values()].filter((o) => !o).length };
}
