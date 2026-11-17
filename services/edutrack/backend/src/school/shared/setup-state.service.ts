import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type { TenantTx } from './tenant-tx.js';

type Db = Pick<Prisma.TransactionClient, 'setupStepState'> | Pick<TenantTx, 'setupStepState'>;

/**
 * School Admin's step ids (the Setup Center's slugs) whose stored key differs. `SetupStepState`
 * keeps the short keys the back office reads (`platform/schools/school-view.ts`).
 */
const STORED_KEY: Record<string, string> = {
  'academic-session': 'session',
  'classes-arms': 'classes',
  'subjects-curriculum': 'subjects',
  'assessment-grading': 'assessment',
  'teacher-assignments': 'assignments',
  'parents-guardians': 'guardians',
};
const STEP_ID = Object.fromEntries(Object.entries(STORED_KEY).map(([id, key]) => [key, id]));

/** `academic-session` → `session` (the `SetupStepState.stepKey`). */
export const storedStepKey = (stepId: string) => STORED_KEY[stepId] ?? stepId;
/** `session` → `academic-session` (the Setup Center's step id). */
export const setupStepId = (stepKey: string) => STEP_ID[stepKey] ?? stepKey;

/**
 * Whether the school has confirmed a Setup Center step (`SetupStepState.confirmedAt`), by the Setup
 * Center's step ids. Screens that complete a step on save call `confirm()` (creating the first
 * session confirms `academic-session`; saving the school profile should confirm `school-profile`),
 * and the Setup Center reads `confirmedKeys()`.
 */
@Injectable()
export class SetupStateService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly clock: Clock,
  ) {}

  async confirmedKeys(): Promise<Set<string>> {
    const rows = await this.tenant.db.setupStepState.findMany({
      where: { confirmedAt: { not: null } },
      select: { stepKey: true },
    });
    return new Set(rows.map((r) => setupStepId(r.stepKey)));
  }

  async isConfirmed(stepId: string): Promise<boolean> {
    return (await this.confirmedKeys()).has(stepId);
  }

  /** Marks a step confirmed by the signed-in user (no-op when it already is). */
  async confirm(stepId: string, db: Db = this.tenant.db): Promise<void> {
    const stepKey = storedStepKey(stepId);
    const ctx = RequestContext.get();
    const schoolId = ctx?.schoolId;
    if (!schoolId) return;
    const client = db as Pick<Prisma.TransactionClient, 'setupStepState'>;
    const existing = await client.setupStepState.findFirst({ where: { stepKey } });
    if (existing?.confirmedAt) return;
    const data = { confirmedAt: this.clock.now(), confirmedById: ctx?.userId ?? null };
    if (existing) await client.setupStepState.update({ where: { id: existing.id }, data });
    else await client.setupStepState.create({ data: { schoolId, stepKey, ...data } });
  }
}
