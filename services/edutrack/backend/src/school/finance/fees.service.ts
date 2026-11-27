import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { fmtDate } from '../academics/academic-format.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import type { DiscountRec, FeeItemRec, PlanRec, TermRef } from './finance-data.js';
import { BoardingFeesService } from '../boarding/boarding-fees.service.js';
import { FinanceCore } from './finance-core.service.js';
import {
  ALL_METHODS,
  FEE_CATEGORIES,
  FEE_CATEGORY_DB,
  FEE_CHARGED_DB,
  FEE_TYPE_DB,
  FIN_ROUTE,
  METHOD_DB,
  SUGGESTED_ITEMS,
  addDays,
  dateOnly,
  daysBetween,
  finConflict,
  finFail,
  kobo,
  levelSection,
  money,
  notFound,
  plural,
  requireDate,
  requireMoney,
  requireText,
  sum,
  type FeeCategoryLabel,
  type FeeChargedLabel,
  type FeeTypeLabel,
  type MethodLabel,
  FEE_AUDIENCE_DB,
  type FeeAudienceLabel,
} from './finance-format.js';
import type { FinanceNotice, FinView } from './finance-view.js';
import type {
  DiscountDto,
  FeeItemDto,
  FeesQuery,
  FinanceSettingsDto,
  PlanDto,
  StructureCopyDto,
  StructurePublishDto,
  StructureSaveDto,
} from './dto/fees.dto.js';

type StructureStatus = 'Not created' | 'Draft' | 'Published';
type Amounts = Record<string, Record<string, number | null>>;

export interface StructureLevel {
  /** Boarding items apply here (the campus takes boarders in this class). */
  boards: boolean;
  id: string;
  name: string;
  section: string;
  students: number;
  amounts: Record<string, number | null>;
  compulsoryTotal: number;
  optionalTotal: number;
  missing: string[];
}

const CHARGED = ['Every term', 'Once a session', 'New students only'];
const BASES = ['Sibling', 'Staff child', 'Scholarship', 'Custom'];

/** Whether a fee item is charged in a term, given the term's position in its session. */
export function chargedIn(item: FeeItemRec, termIndex: number, isNew: boolean) {
  if (item.charged === 'Every term') return true;
  if (item.charged === 'Once a session') return termIndex === 0;
  return isNew;
}

/** When a term's fees are due: Billing settings, else two weeks after it starts. */
export const dueDateFor = (t: TermRef) => t.due ?? addDays(t.start, 14);

/**
 * Finance › Fees (as the School Admin mock's `finance-fees.ts`): fee items, fee structures per
 * term and branch (amounts per class level), discounts, payment plans and billing settings.
 * Invoices are only created from a published structure.
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly core: FinanceCore,
    private readonly boardingFees: BoardingFeesService,
  ) {}

  /** After a published structure changes: boarders billed before their class had boarding fees. */
  private async catchUpBoarders(
    tx: TenantTx,
    structureId: string,
    termId: string,
    branchId: string,
    term: string,
  ) {
    const changed = await this.boardingFees.catchUp(tx, termId, branchId);
    if (changed)
      await this.core.log(tx, [
        {
          entity: 'FeeStructure',
          entityId: structureId,
          action: 'fee-structure.boarders-billed',
          title: `Boarding fees added to ${plural(changed, 'boarder’s invoice', 'boarders’ invoices')} · ${term}`,
        },
      ]);
  }

  /* ---------------- Shared ---------------- */

  private structureFor(v: FinView, termId: string, branchId: string) {
    return v.fin.structures.find((s) => s.termId === termId && s.branchId === branchId);
  }

  private structureStatus(v: FinView, termId: string, branchId: string): StructureStatus {
    return this.structureFor(v, termId, branchId)?.status ?? 'Not created';
  }

  private itemView(v: FinView, i: FeeItemRec) {
    return {
      ...i,
      invoiceLines: sum(
        v.fin.invoices.map((inv) => inv.lines.filter((l) => l.itemId === i.id).length),
      ),
    };
  }

  private enrolled(v: FinView, branchId: string, levelId: string) {
    return [...v.students.values()].filter(
      (s) => s.active && s.branchId === branchId && s.levelId === levelId,
    ).length;
  }

  private nextTerm(v: FinView, t: TermRef) {
    const list = [...v.planningTerms()].sort((a, b) => a.start.localeCompare(b.start));
    return list[list.findIndex((x) => x.id === t.id) + 1] ?? null;
  }

  private prerequisites(v: FinView) {
    const out: string[] = [];
    if (!v.planningTerms().length) out.push('Academic Session');
    if (!v.fin.levels.length) out.push('Classes & Arms');
    return out;
  }

  private compulsoryTotal(v: FinView, amounts: Record<string, number | null>, term: TermRef) {
    return sum(
      v.fin.items
        .filter(
          (i) =>
            i.status === 'Active' && i.type === 'Compulsory' && chargedIn(i, term.index, false),
        )
        .map((i) => amounts[i.id] ?? 0),
    );
  }

  private feeNotices(v: FinView, term: TermRef): FinanceNotice[] {
    const out: FinanceNotice[] = [];
    const next = this.nextTerm(v, term);
    for (const b of v.activeBranches()) {
      if (this.structureStatus(v, term.id, b.id) !== 'Published' && v.branchLevels(b.id).length)
        out.push({
          tone: 'warning',
          title: `${term.name} fees not published at ${b.name}`,
          description: 'Invoices can only be created from a published fee structure.',
          action: {
            label: 'Open structure',
            to: { name: FIN_ROUTE.fees, query: { tab: 'structures', term: term.id, branch: b.id } },
          },
        });
    }
    if (next && v.fin.items.length) {
      const missing = v
        .activeBranches()
        .filter((b) => this.structureStatus(v, next.id, b.id) === 'Not created');
      if (missing.length && daysBetween(v.today, next.start) <= 100)
        out.push({
          tone: 'warning',
          title: `${next.name} fee structures not created`,
          description: `${next.name} starts ${fmtDate(next.start)}. Copy ${term.name}’s amounts as a draft, review them, then publish before issuing invoices.`,
          action: {
            label: 'Open structure',
            to: {
              name: FIN_ROUTE.fees,
              query: { tab: 'structures', term: next.id, branch: missing[0]!.id },
            },
          },
        });
    }
    return out;
  }

  private branchFrom(v: FinView, id?: string | null) {
    const list = v.activeBranches();
    // None asked for: the header's working branch, else the first.
    const working = RequestContext.working().branch;
    const b =
      list.find((x) => x.id === id || x.name === id) ??
      list.find((x) => x.name === working) ??
      list[0];
    if (!b) throw finConflict('Add a branch first.', 'NO_BRANCH');
    return b.id;
  }

  /** Replaces a structure's amounts (level name → item → naira; null = blank). */
  private async writeAmounts(
    tx: TenantTx,
    v: FinView,
    structureId: string,
    branchId: string,
    amounts: Amounts,
  ) {
    const schoolId = this.core.schoolId();
    const levels = v.branchLevels(branchId);
    const items = new Set(v.fin.items.map((i) => i.id));
    await tx.feeStructureAmount.deleteMany({ where: { structureId } });
    const data = levels.flatMap((l) =>
      Object.entries(amounts[l.name] ?? {})
        .filter(([itemId, n]) => items.has(itemId) && typeof n === 'number')
        .map(([itemId, n]) => ({
          schoolId,
          structureId,
          levelId: l.id,
          feeItemId: itemId,
          amountKobo: kobo(n!),
        })),
    );
    if (data.length) await tx.feeStructureAmount.createMany({ data });
  }

  /* ---------------- Overview ---------------- */

  async overview(q: FeesQuery) {
    const v = await this.core.load();
    const planning = v.planningTerms();
    const term = planning.length ? v.termOf(q.term, q.session) : null;
    const structures = planning.flatMap((t) =>
      v.activeBranches().map((b) => {
        const st = this.structureFor(v, t.id, b.id);
        const totals = v
          .branchLevels(b.id)
          .map((l) => this.compulsoryTotal(v, st?.amounts[l.name] ?? {}, t))
          .filter((n) => n > 0);
        return {
          termId: t.id,
          term: t.name,
          session: t.session,
          termStatus: t.status,
          branchId: b.id,
          branch: b.name,
          status: st?.status ?? ('Not created' as const),
          levels: Object.keys(st?.amounts ?? {}).length,
          compulsoryRange: totals.length
            ? ([Math.min(...totals), Math.max(...totals)] as [number, number])
            : null,
          invoices: v.fin.invoices.filter(
            (i) => i.termId === t.id && i.branchId === b.id && i.status !== 'Cancelled',
          ).length,
          publishedOn: st?.publishedOn ?? null,
        };
      }),
    );
    return {
      started: v.fin.items.length > 0,
      items: v.fin.items.map((i) => this.itemView(v, i)),
      structures,
      notices: term ? this.feeNotices(v, term) : [],
      suggested: SUGGESTED_ITEMS.map(([name, category, charged, type]) => ({
        name,
        category,
        charged,
        type,
      })),
      prerequisites: this.prerequisites(v),
    };
  }

  /** Starts Finance with suggested items (and draft amounts for the current term) or Tuition only. */
  async start(mode?: string) {
    const tuitionOnly = mode === 'tuition';
    const created = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const pre = this.prerequisites(v);
      if (pre.length) throw finConflict(`Finish ${pre.join(' and ')} first.`, 'FEES_PREREQUISITES');
      if (v.fin.items.length) throw finConflict('Fee items already exist.', 'FEES_STARTED');
      const schoolId = this.core.schoolId();
      const rows = tuitionOnly ? SUGGESTED_ITEMS.slice(0, 1) : SUGGESTED_ITEMS;
      const ids = new Map<string, string>();
      for (const [name, category, charged, type] of rows) {
        const item = await tx.feeItem.create({
          data: {
            schoolId,
            name,
            category: FEE_CATEGORY_DB[category],
            charged: FEE_CHARGED_DB[charged],
            type: FEE_TYPE_DB[type],
          },
        });
        ids.set(name, item.id);
      }
      const term = v.termOf();
      for (const b of v.activeBranches()) {
        const st = await tx.feeStructure.create({
          data: { schoolId, termId: term.id, branchId: b.id, status: 'DRAFT' },
        });
        if (tuitionOnly) continue;
        const amounts: Amounts = {};
        for (const l of v.branchLevels(b.id)) {
          const code = levelSection(l.name);
          amounts[l.name] = Object.fromEntries(
            rows.map(([name, , , , a]) => [ids.get(name)!, a[code] ?? null]),
          );
        }
        // The snapshot doesn't know the new items yet: write the rows directly.
        const data = v.branchLevels(b.id).flatMap((l) =>
          Object.entries(amounts[l.name] ?? {})
            .filter(([, n]) => typeof n === 'number')
            .map(([itemId, n]) => ({
              schoolId,
              structureId: st.id,
              levelId: l.id,
              feeItemId: itemId,
              amountKobo: kobo(n!),
            })),
        );
        if (data.length) await tx.feeStructureAmount.createMany({ data });
      }
      await this.core.log(tx, [
        {
          entity: 'FeeItem',
          action: 'fees.start',
          title: 'Fee items added',
          detail: plural(rows.length, 'item'),
        },
      ]);
      return rows.length;
    });
    return { items: created };
  }

  /* ---------------- Fee items ---------------- */

  private itemPayload(v: FinView, p: FeeItemDto, exceptId?: string) {
    const name = requireText(p.name, 'Name the fee.', 120);
    if (v.fin.items.some((i) => i.id !== exceptId && i.name.toLowerCase() === name.toLowerCase()))
      throw finFail(`A fee item called ${name} already exists.`, 'VALIDATION');
    if (!FEE_CATEGORIES.includes(p.category as FeeCategoryLabel))
      throw finFail('Choose a category.', 'VALIDATION');
    if (!CHARGED.includes(p.charged ?? ''))
      throw finFail('Choose when it is charged.', 'VALIDATION');
    if (!['Compulsory', 'Optional'].includes(p.type ?? ''))
      throw finFail('Choose compulsory or optional.', 'VALIDATION');
    // Left out (e.g. a school without boarding): keep what the item already has.
    const appliesTo = (p.appliesTo ??
      v.fin.items.find((i) => i.id === exceptId)?.appliesTo ??
      'Everyone') as FeeAudienceLabel;
    if (!(appliesTo in FEE_AUDIENCE_DB))
      throw finFail(
        'Choose who pays it: everyone, boarders, boy boarders or girl boarders.',
        'VALIDATION',
      );
    return {
      appliesTo,
      name,
      category: p.category as FeeCategoryLabel,
      charged: p.charged as FeeChargedLabel,
      type: p.type as FeeTypeLabel,
      description: (p.description ?? '').trim(),
    };
  }

  private itemData(p: ReturnType<FeesService['itemPayload']>) {
    return {
      name: p.name,
      category: FEE_CATEGORY_DB[p.category],
      charged: FEE_CHARGED_DB[p.charged],
      type: FEE_TYPE_DB[p.type],
      appliesTo: FEE_AUDIENCE_DB[p.appliesTo],
      description: p.description,
    };
  }

  private async itemResult(id: string) {
    const v = await this.core.load();
    const item = v.fin.items.find((i) => i.id === id)!;
    return this.itemView(v, item);
  }

  private findItem(v: FinView, id: string) {
    const item = v.fin.items.find((i) => i.id === id);
    if (!item) throw notFound('Fee item not found', 'FEE_ITEM_NOT_FOUND');
    return item;
  }

  async createItem(dto: FeeItemDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const p = this.itemPayload(v, dto);
      const item = await tx.feeItem.create({
        data: { schoolId: this.core.schoolId(), ...this.itemData(p) },
      });
      await this.core.log(tx, [
        {
          entity: 'FeeItem',
          entityId: item.id,
          action: 'fee-item.create',
          title: `Fee item added: ${p.name}`,
          detail: `${p.type} · ${p.charged}`,
        },
      ]);
      return item.id;
    });
    return this.itemResult(id);
  }

  async updateItem(id: string, dto: FeeItemDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const item = this.findItem(v, id);
      const p = this.itemPayload(v, dto, item.id);
      if (
        item.category === 'Tuition' &&
        p.type === 'Optional' &&
        v.fin.items.filter(
          (i) => i.category === 'Tuition' && i.type === 'Compulsory' && i.status === 'Active',
        ).length === 1
      )
        throw finFail('Keep at least one compulsory tuition fee.', 'VALIDATION');
      await tx.feeItem.update({ where: { id: item.id }, data: this.itemData(p) });
      await this.core.log(tx, [
        {
          entity: 'FeeItem',
          entityId: item.id,
          action: 'fee-item.update',
          title: `Fee item updated: ${p.name}`,
        },
      ]);
    });
    return this.itemResult(id);
  }

  /** Removes an unused item, or archives one invoices already carry. */
  async removeItem(id: string) {
    return this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const item = this.findItem(v, id);
      const used = this.itemView(v, item).invoiceLines;
      if (
        item.type === 'Compulsory' &&
        v.fin.items.filter(
          (i) => i.type === 'Compulsory' && i.status === 'Active' && i.id !== item.id,
        ).length === 0
      )
        throw finFail('Keep at least one compulsory fee, such as Tuition.', 'VALIDATION');
      if (used) {
        await tx.feeItem.update({ where: { id: item.id }, data: { status: 'ARCHIVED' } });
        await this.core.log(tx, [
          {
            entity: 'FeeItem',
            entityId: item.id,
            action: 'fee-item.archive',
            title: `Fee item archived: ${item.name}`,
            detail: `${plural(used, 'invoice line')} keep it`,
            tone: 'neutral',
          },
        ]);
        return { archived: true };
      }
      await tx.feeStructureAmount.deleteMany({ where: { feeItemId: item.id } });
      await tx.feeItem.delete({ where: { id: item.id } });
      await this.core.log(tx, [
        {
          entity: 'FeeItem',
          entityId: item.id,
          action: 'fee-item.delete',
          title: `Fee item removed: ${item.name}`,
          tone: 'neutral',
        },
      ]);
      return { archived: false };
    });
  }

  async restoreItem(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const item = this.findItem(v, id);
      await tx.feeItem.update({ where: { id: item.id }, data: { status: 'ACTIVE' } });
      await this.core.log(tx, [
        {
          entity: 'FeeItem',
          entityId: item.id,
          action: 'fee-item.restore',
          title: `Fee item restored: ${item.name}`,
        },
      ]);
    });
    return this.itemResult(id);
  }

  /* ---------------- Structures ---------------- */

  /** Class levels that take boarders at a branch (Boarding › Set-up). */
  private async boardingLevelIds(db: TenantTx, branchId: string): Promise<Set<string>> {
    const sections = await db.branchSection.findMany({
      where: { branchId, boarding: true },
      select: { sectionId: true, boardingLevelIds: true },
    });
    if (!sections.length) return new Set();
    const levels = await db.classLevel.findMany({
      where: { sectionId: { in: sections.map((x) => x.sectionId) } },
      select: { id: true, sectionId: true },
    });
    return new Set(
      levels
        .filter((l) => {
          const x = sections.find((y) => y.sectionId === l.sectionId)!;
          return !x.boardingLevelIds.length || x.boardingLevelIds.includes(l.id);
        })
        .map((l) => l.id),
    );
  }

  private structureView(
    v: FinView,
    term: TermRef,
    branchId: string,
    boards: Set<string> = new Set(),
  ) {
    const st = this.structureFor(v, term.id, branchId);
    const items = v.fin.items
      .filter((i) => i.status === 'Active')
      .sort((a, b) => (a.type === b.type ? 0 : a.type === 'Compulsory' ? -1 : 1))
      .map((i) => ({
        ...this.itemView(v, i),
        chargedThisTerm: i.charged !== 'Once a session' || term.index === 0,
      }));
    const sections = new Map<string, StructureLevel[]>();
    let students = 0;
    let projected = 0;
    for (const l of v.branchLevels(branchId)) {
      const amounts = Object.fromEntries(
        items.map((i) => [i.id, st?.amounts[l.name]?.[i.id] ?? null]),
      );
      const n = this.enrolled(v, branchId, l.id);
      const compulsory = this.compulsoryTotal(v, amounts, term);
      students += n;
      projected += n * compulsory;
      const takesBoarders = boards.has(l.id);
      const row: StructureLevel = {
        id: l.name,
        name: l.name,
        section: l.section,
        boards: takesBoarders,
        students: n,
        amounts,
        compulsoryTotal: compulsory,
        optionalTotal: sum(
          items.filter((i) => i.type === 'Optional').map((i) => amounts[i.id] ?? 0),
        ),
        missing: items
          .filter(
            (i) =>
              i.type === 'Compulsory' &&
              i.charged === 'Every term' &&
              amounts[i.id] == null &&
              // Boarding fees aren't missing in a class that takes no boarders.
              (i.appliesTo === 'Everyone' || takesBoarders),
          )
          .map((i) => i.name),
      };
      sections.set(l.section, [...(sections.get(l.section) ?? []), row]);
    }
    const terms = v.planningTerms();
    const notices: FinanceNotice[] = [];
    const issued = v.fin.invoices.filter(
      (i) => i.termId === term.id && i.branchId === branchId && i.status !== 'Cancelled',
    ).length;
    if (st?.status === 'Published' && issued)
      notices.push({
        tone: 'info',
        title: `${plural(issued, 'invoice')} issued from this structure`,
        description:
          'Changing amounts affects invoices you create from now on. Issued invoices keep their amounts; adjust them one by one from Invoices.',
      });
    if (st?.status === 'Draft')
      notices.push({
        tone: 'warning',
        title: 'Draft',
        description: 'Invoices can’t be created from this structure until you publish it.',
      });
    if (!st)
      notices.push({
        tone: 'info',
        title: `No ${term.name} structure at ${v.branchName(branchId)} yet`,
        description: 'Copy another term’s or branch’s amounts, or enter them here.',
      });
    return {
      term: {
        id: term.id,
        name: term.name,
        session: term.session,
        start: term.start,
        end: term.end,
      },
      branch: { id: branchId, name: v.branchName(branchId) },
      status: st?.status ?? ('Not created' as StructureStatus),
      publishedOn: st?.publishedOn ?? null,
      items,
      sections: [...sections].map(([name, levels]) => ({ name, levels })),
      students,
      projected,
      invoicesIssued: issued,
      terms: terms.map((t) => ({ id: t.id, name: t.name, session: t.session, status: t.status })),
      branches: v.activeBranches().map((b) => ({ id: b.id, name: b.name })),
      statuses: Object.fromEntries(
        terms.map((t) => [t.id, this.structureStatus(v, t.id, branchId)]),
      ),
      otherBranches: v
        .activeBranches()
        .filter((b) => b.id !== branchId)
        .map((b) => ({ id: b.id, name: b.name, status: this.structureStatus(v, term.id, b.id) })),
      notices,
    };
  }

  private async structureResult(termId: string, branchId: string) {
    const v = await this.core.load();
    return this.structureView(
      v,
      v.termOf(termId),
      branchId,
      await this.boardingLevelIds(this.core.db as unknown as TenantTx, branchId),
    );
  }

  async structure(q: FeesQuery) {
    const v = await this.core.load();
    const branchId = this.branchFrom(v, q.branch);
    return this.structureView(
      v,
      v.termOf(q.term, q.session),
      branchId,
      await this.boardingLevelIds(this.core.db as unknown as TenantTx, branchId),
    );
  }

  private cleanAmounts(v: FinView, branchId: string, raw: Amounts | undefined): Amounts {
    const out: Amounts = {};
    const bad: string[] = [];
    for (const { name: level } of v.branchLevels(branchId)) {
      out[level] = {};
      for (const item of v.fin.items) {
        const value: unknown = raw?.[level]?.[item.id];
        if (value === null || value === undefined || value === '') {
          out[level][item.id] = null;
          continue;
        }
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 10_000_000
        ) {
          bad.push(`${level} · ${item.name}`);
          continue;
        }
        out[level][item.id] = value;
      }
    }
    if (bad.length)
      throw finFail(
        `${plural(bad.length, 'amount')} need fixing: whole naira up to ₦10,000,000 (${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}).`,
        'VALIDATION',
      );
    return out;
  }

  async saveStructure(dto: StructureSaveDto) {
    const key = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const term = v.termOf(dto.termId);
      const branchId = this.branchFrom(v, dto.branchId);
      const amounts = this.cleanAmounts(v, branchId, dto.amounts);
      const existing = this.structureFor(v, term.id, branchId);
      const structureId =
        existing?.id ??
        (
          await tx.feeStructure.create({
            data: { schoolId: this.core.schoolId(), termId: term.id, branchId, status: 'DRAFT' },
          })
        ).id;
      await this.writeAmounts(tx, v, structureId, branchId, amounts);
      if (existing?.status === 'Published')
        await this.catchUpBoarders(tx, structureId, term.id, branchId, term.name);
      await this.core.log(tx, [
        {
          entity: 'FeeStructure',
          entityId: structureId,
          action: 'fee-structure.save',
          title:
            existing?.status === 'Published'
              ? `${term.name} fees changed · ${v.branchName(branchId)}`
              : `${term.name} fees saved · ${v.branchName(branchId)}`,
        },
      ]);
      return { termId: term.id, branchId };
    });
    return this.structureResult(key.termId, key.branchId);
  }

  async publishStructure(dto: StructurePublishDto) {
    const key = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const term = v.termOf(dto.termId);
      const branchId = this.branchFrom(v, dto.branchId);
      const st = this.structureFor(v, term.id, branchId);
      if (!st) throw finFail('Enter amounts before publishing.', 'STRUCTURE_EMPTY');
      if (!v.fin.items.some((i) => i.status === 'Active' && i.type === 'Compulsory'))
        throw finFail('Add at least one compulsory fee, such as Tuition.', 'NO_COMPULSORY_FEE');
      const view = this.structureView(v, term, branchId, await this.boardingLevelIds(tx, branchId));
      const gaps = view.sections
        .flatMap((s) => s.levels)
        .filter((l) => l.students > 0 && (l.missing.length || l.compulsoryTotal === 0));
      if (gaps.length)
        throw finFail(
          `${plural(gaps.length, 'class', 'classes')} with students ${gaps.length === 1 ? 'has' : 'have'} compulsory fees left blank: ${gaps
            .slice(0, 4)
            .map((l) => `${l.name} (${l.missing.join(', ') || 'no fees'})`)
            .join('; ')}.`,
          'STRUCTURE_INCOMPLETE',
        );
      await tx.feeStructure.update({
        where: { id: st.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: this.core.now(),
          publishedById: this.core.userId(),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'FeeStructure',
          entityId: st.id,
          action: 'fee-structure.publish',
          title: `${term.name} fees published · ${v.branchName(branchId)}`,
          tone: 'success',
        },
      ]);
      await this.catchUpBoarders(tx, st.id, term.id, branchId, term.name);
      return { termId: term.id, branchId };
    });
    return this.structureResult(key.termId, key.branchId);
  }

  async copyStructure(dto: StructureCopyDto) {
    const key = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const from = v.termOf(dto.fromTermId);
      const to = v.termOf(dto.toTermId);
      const targets = dto.allBranches
        ? v.activeBranches().map((b) => b.id)
        : [this.branchFrom(v, dto.branchId)];
      const fromBranch = dto.fromBranchId ? this.branchFrom(v, dto.fromBranchId) : null;
      let copied = 0;
      for (const branchId of targets) {
        const source = this.structureFor(v, from.id, fromBranch ?? branchId);
        if (!source) continue;
        const existing = this.structureFor(v, to.id, branchId);
        if (existing?.status === 'Published')
          throw finConflict(
            `${to.name} fees at ${v.branchName(branchId)} are already published. Edit the amounts instead.`,
            'STRUCTURE_PUBLISHED',
          );
        if (existing?.id === source.id) continue;
        const amounts: Amounts = Object.fromEntries(
          v.branchLevels(branchId).map((l) => [l.name, { ...source.amounts[l.name] }]),
        );
        const structureId =
          existing?.id ??
          (
            await tx.feeStructure.create({
              data: { schoolId: this.core.schoolId(), termId: to.id, branchId, status: 'DRAFT' },
            })
          ).id;
        await this.writeAmounts(tx, v, structureId, branchId, amounts);
        await this.core.log(tx, [
          {
            entity: 'FeeStructure',
            entityId: structureId,
            action: 'fee-structure.copy',
            title: `Copied from ${from.name}${fromBranch ? ` at ${v.branchName(fromBranch)}` : ''}`,
            detail: `${to.name} · ${v.branchName(branchId)}`,
          },
        ]);
        copied++;
      }
      if (!copied) throw finFail(`There are no ${from.name} amounts to copy.`, 'NOTHING_TO_COPY');
      return { termId: to.id, branchId: targets[0]! };
    });
    return this.structureResult(key.termId, key.branchId);
  }

  /* ---------------- Discounts ---------------- */

  private discountView(v: FinView, d: DiscountRec) {
    const session = v.termOf().session;
    const lines = v.fin.invoices
      .filter(
        (i) =>
          i.status !== 'Cancelled' && v.terms.find((t) => t.id === i.termId)?.session === session,
      )
      .flatMap((i) => i.discounts.filter((x) => x.discountId === d.id));
    const value = d.kind === 'Percentage' ? `${d.value}%` : money(d.value);
    const what = d.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory fees';
    return {
      ...d,
      automatic: d.basis === 'Sibling',
      applied: lines.length,
      given: sum(lines.map((l) => l.amount)),
      description:
        d.basis === 'Sibling'
          ? `${value} off ${what} · ${d.fromChild === 3 ? '3rd' : '2nd'} child onwards of the same fee payer`
          : `${d.basis === 'Custom' ? 'Up to ' : ''}${value} off ${what}${d.needsApproval ? ' · approval recorded' : ''}`,
    };
  }

  private discountPayload(v: FinView, p: DiscountDto, exceptId?: string) {
    const name = requireText(p.name, 'Name the discount.', 120);
    if (
      v.fin.discounts.some((d) => d.id !== exceptId && d.name.toLowerCase() === name.toLowerCase())
    )
      throw finFail('A discount with that name already exists.', 'VALIDATION');
    if (!BASES.includes(p.basis ?? ''))
      throw finFail('Choose what the discount is for.', 'VALIDATION');
    if (
      p.basis === 'Sibling' &&
      v.fin.discounts.some(
        (d) => d.id !== exceptId && d.basis === 'Sibling' && d.status === 'Active',
      )
    )
      throw finFail('Only one sibling rule can apply. Edit the existing one.', 'VALIDATION');
    const kind = p.kind === 'Percentage' ? 'Percentage' : 'Fixed amount';
    const value = Number(p.value);
    if (!Number.isFinite(value) || value <= 0)
      throw finFail('Enter a value above 0.', 'VALIDATION');
    if (kind === 'Percentage' && value > 100)
      throw finFail('A percentage must be between 1 and 100.', 'VALIDATION');
    if (kind === 'Fixed amount' && value > 100_000_000)
      throw finFail('That amount is too large.', 'VALIDATION');
    const sibling = p.basis === 'Sibling';
    const rounded = Math.round(value);
    return {
      name,
      basis: p.basis!,
      kind,
      value: rounded,
      data: {
        name,
        basis: sibling
          ? ('SIBLING' as const)
          : p.basis === 'Staff child'
            ? ('STAFF_CHILD' as const)
            : p.basis === 'Scholarship'
              ? ('SCHOLARSHIP' as const)
              : ('CUSTOM' as const),
        kind: kind === 'Percentage' ? ('PERCENTAGE' as const) : ('FIXED_AMOUNT' as const),
        value: kind === 'Percentage' ? BigInt(rounded * 100) : kobo(rounded),
        appliesTo:
          p.appliesTo === 'All compulsory items'
            ? ('ALL_COMPULSORY' as const)
            : ('TUITION_ONLY' as const),
        fromChild: sibling ? (p.fromChild === 3 ? 3 : 2) : null,
        needsApproval: sibling ? false : p.needsApproval !== false,
        isAutomatic: sibling,
        status: p.status === 'Inactive' ? ('INACTIVE' as const) : ('ACTIVE' as const),
      },
    };
  }

  private findDiscount(v: FinView, id: string) {
    const d = v.fin.discounts.find((x) => x.id === id);
    if (!d) throw notFound('Discount not found', 'DISCOUNT_NOT_FOUND');
    return d;
  }

  private async discountResult(id: string) {
    const v = await this.core.load();
    return this.discountView(v, this.findDiscount(v, id));
  }

  async discounts() {
    const v = await this.core.load();
    return v.fin.discounts.map((d) => this.discountView(v, d));
  }

  async createDiscount(dto: DiscountDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const p = this.discountPayload(v, dto);
      const d = await tx.discount.create({ data: { schoolId: this.core.schoolId(), ...p.data } });
      await this.core.log(tx, [
        {
          entity: 'Discount',
          entityId: d.id,
          action: 'discount.create',
          title: `Discount added: ${p.name}`,
        },
      ]);
      return d.id;
    });
    return this.discountResult(id);
  }

  async updateDiscount(id: string, dto: DiscountDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const d = this.findDiscount(v, id);
      const p = this.discountPayload(v, dto, d.id);
      await tx.discount.update({ where: { id: d.id }, data: p.data });
      await this.core.log(tx, [
        {
          entity: 'Discount',
          entityId: d.id,
          action: 'discount.update',
          title: `Discount updated: ${p.name}`,
          detail: 'applies to invoices created from now on',
        },
      ]);
    });
    return this.discountResult(id);
  }

  /* ---------------- Payment plans ---------------- */

  private planView(v: FinView, p: PlanRec) {
    const term = v.termOf();
    const invs = v.fin.invoices.filter(
      (i) => i.termId === term.id && i.planId === p.id && i.status === 'Issued',
    );
    return {
      ...p,
      students: invs.length,
      overdue: invs.filter((i) => v.ledger.invoice(i.id).overdue).length,
      schedule: p.split
        .map((pct, i) => `${pct}% by ${fmtDate(addDays(term.start, p.offsets[i] ?? 0), false)}`)
        .join(' · '),
    };
  }

  private planPayload(v: FinView, p: PlanDto, exceptId?: string) {
    const name = requireText(p.name, 'Name the plan.', 120);
    if (v.fin.plans.some((x) => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase()))
      throw finFail('A plan with that name already exists.', 'VALIDATION');
    const split = (p.split ?? []).map(Number);
    const offsets = (p.offsets ?? []).map(Number);
    if (!split.length || split.length > 12 || split.some((n) => !Number.isInteger(n) || n <= 0))
      throw finFail('Each part must be a whole percentage above 0.', 'VALIDATION');
    if (sum(split) !== 100)
      throw finFail(`Parts add up to ${sum(split)}%. They must total 100.`, 'VALIDATION');
    if (offsets.length !== split.length || offsets.some((n) => !Number.isInteger(n) || n < 0))
      throw finFail('Give one due day (days after the term starts) for each part.', 'VALIDATION');
    if (offsets.some((n, i) => i > 0 && n <= offsets[i - 1]!))
      throw finFail('Each due day must be later than the one before.', 'VALIDATION');
    const shortest = Math.min(...v.planningTerms().map((t) => daysBetween(t.start, t.end)));
    if (Number.isFinite(shortest) && offsets[offsets.length - 1]! > shortest)
      throw finFail(
        `The last part falls after the end of the shortest term (${shortest} days).`,
        'VALIDATION',
      );
    return { name, split, offsets };
  }

  private async writeInstallments(
    tx: TenantTx,
    planId: string,
    p: { split: number[]; offsets: number[] },
  ) {
    await tx.paymentPlanInstallment.deleteMany({ where: { planId } });
    await tx.paymentPlanInstallment.createMany({
      data: p.split.map((pct, i) => ({
        schoolId: this.core.schoolId(),
        planId,
        sequence: i + 1,
        shareBp: pct * 100,
        offsetDays: p.offsets[i]!,
      })),
    });
  }

  private findPlan(v: FinView, id: string) {
    const p = v.fin.plans.find((x) => x.id === id);
    if (!p) throw notFound('Plan not found', 'PLAN_NOT_FOUND');
    return p;
  }

  private async planResult(id: string) {
    const v = await this.core.load();
    return this.planView(v, this.findPlan(v, id));
  }

  async plans() {
    const v = await this.core.load();
    return v.fin.plans.map((p) => this.planView(v, p));
  }

  async createPlan(dto: PlanDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const p = this.planPayload(v, dto);
      const plan = await tx.paymentPlan.create({
        data: { schoolId: this.core.schoolId(), name: p.name, isDefault: !v.fin.plans.length },
      });
      await this.writeInstallments(tx, plan.id, p);
      await this.core.log(tx, [
        {
          entity: 'PaymentPlan',
          entityId: plan.id,
          action: 'plan.create',
          title: `Payment plan added: ${p.name}`,
        },
      ]);
      return plan.id;
    });
    return this.planResult(id);
  }

  async updatePlan(id: string, dto: PlanDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const plan = this.findPlan(v, id);
      const p = this.planPayload(v, dto, plan.id);
      await tx.paymentPlan.update({ where: { id: plan.id }, data: { name: p.name } });
      await this.writeInstallments(tx, plan.id, p);
      await this.core.log(tx, [
        {
          entity: 'PaymentPlan',
          entityId: plan.id,
          action: 'plan.update',
          title: `Payment plan updated: ${p.name}`,
        },
      ]);
    });
    return this.planResult(id);
  }

  async defaultPlan(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const plan = this.findPlan(v, id);
      // One default per school (partial unique index): clear the old one first.
      await tx.paymentPlan.updateMany({
        where: { isDefault: true, id: { not: plan.id } },
        data: { isDefault: false },
      });
      await tx.paymentPlan.update({
        where: { id: plan.id },
        data: { isDefault: true, status: 'ACTIVE' },
      });
      await this.core.log(tx, [
        {
          entity: 'PaymentPlan',
          entityId: plan.id,
          action: 'plan.default',
          title: `Default payment plan: ${plan.name}`,
        },
      ]);
    });
    return this.planResult(id);
  }

  async togglePlan(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const plan = this.findPlan(v, id);
      if (plan.isDefault) throw finFail('Choose another default plan first.', 'PLAN_IS_DEFAULT');
      const next = plan.status === 'Active' ? 'INACTIVE' : 'ACTIVE';
      await tx.paymentPlan.update({ where: { id: plan.id }, data: { status: next } });
      await this.core.log(tx, [
        {
          entity: 'PaymentPlan',
          entityId: plan.id,
          action: 'plan.toggle',
          title: `Payment plan ${next === 'ACTIVE' ? 'reactivated' : 'deactivated'}: ${plan.name}`,
          tone: 'neutral',
        },
      ]);
    });
    return this.planResult(id);
  }

  /* ---------------- Settings ---------------- */

  private settingsView(v: FinView) {
    const { holdReportCards: _h, ...rest } = v.fin.settings;
    return {
      ...rest,
      lateFee: { ...rest.lateFee },
      methods: [...rest.methods],
      dueDates: v.planningTerms().map((t) => ({
        termId: t.id,
        term: t.name,
        session: t.session,
        start: t.start,
        end: t.end,
        due: dueDateFor(t),
      })),
    };
  }

  async settings() {
    return this.settingsView(await this.core.load());
  }

  async saveSettings(p: FinanceSettingsDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const prefix = (value: unknown, label: string) => {
        if (typeof value !== 'string' || !/^[A-Z]{2,5}$/.test(value))
          throw finFail(`${label} must be 2–5 capital letters.`, 'VALIDATION');
        return value;
      };
      const invoicePrefix = prefix(p.invoicePrefix, 'Invoice prefix');
      const receiptPrefix = prefix(p.receiptPrefix, 'Receipt prefix');
      if (invoicePrefix === receiptPrefix)
        throw finFail('The receipt prefix must differ from the invoice prefix.', 'VALIDATION');
      const methods = (p.methods ?? []).filter((m): m is MethodLabel =>
        ALL_METHODS.includes(m as MethodLabel),
      );
      if (!methods.length) throw finFail('Pick at least one payment method.', 'VALIDATION');
      const lateKind = p.lateFee?.kind ?? 'None';
      const lateValue = lateKind === 'None' ? 0 : Number(p.lateFee?.value);
      if (lateKind === 'Percentage' && !(lateValue >= 1 && lateValue <= 50))
        throw finFail('A late fee percentage must be between 1 and 50.', 'VALIDATION');
      if (lateKind === 'Fixed amount') requireMoney(lateValue, 'Enter the late fee in naira.');
      const due: { id: string; date: string }[] = [];
      for (const [termId, date] of Object.entries(p.dueDates ?? {})) {
        const t = v.terms.find((x) => x.id === termId);
        if (!t) continue;
        requireDate(date, `Choose a due date for ${t.name}.`);
        if (date < addDays(t.start, -30) || date > t.end)
          throw finFail(
            `${t.name}’s due date must fall between a month before it starts and ${fmtDate(t.end)}.`,
            'VALIDATION',
          );
        due.push({ id: t.id, date });
      }
      const expenseLimit = requireMoney(
        p.expenseLimit ?? v.fin.settings.expenseLimit,
        'Enter the Bursar’s approval limit.',
      );
      const refundLimit = requireMoney(
        p.refundLimit ?? v.fin.settings.refundLimit,
        'Enter the Principal’s refund limit.',
      );
      const schoolId = this.core.schoolId();
      const data = {
        allowPartial: p.allowPartial !== false,
        autoSibling: p.autoSibling !== false,
        verifyTransfers: p.verifyTransfers !== false,
        lateFeeKind:
          lateKind === 'Percentage'
            ? ('PERCENTAGE' as const)
            : lateKind === 'Fixed amount'
              ? ('FIXED_AMOUNT' as const)
              : ('NONE' as const),
        lateFeeValue:
          lateKind === 'Percentage'
            ? BigInt(Math.round(lateValue * 100))
            : lateKind === 'Fixed amount'
              ? kobo(lateValue)
              : 0n,
        enabledMethods: methods.map((m) => METHOD_DB[m]),
        invoicePrefix,
        receiptPrefix,
        transferReference:
          p.transferReference === 'Invoice number'
            ? ('INVOICE_NUMBER' as const)
            : ('ADMISSION_NUMBER' as const),
        expenseLimitKobo: kobo(expenseLimit),
        refundLimitKobo: kobo(refundLimit),
      };
      await tx.financeSettings.upsert({
        where: { schoolId },
        create: { schoolId, ...data },
        update: data,
      });
      for (const d of due)
        await tx.term.update({ where: { id: d.id }, data: { feesDueOn: dateOnly(d.date) } });
      await this.core.log(tx, [
        {
          entity: 'FinanceSettings',
          entityId: schoolId,
          action: 'finance.settings',
          title: 'Finance settings updated',
        },
      ]);
    });
    return this.settings();
  }
}
