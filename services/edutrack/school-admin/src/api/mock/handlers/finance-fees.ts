import { mock, MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  Discount,
  DiscountPayload,
  FeeItem,
  FeeItemPayload,
  FeeStructureView,
  FeesOverview,
  FinanceNotice,
  FinanceSettings,
  FinanceSettingsPayload,
  PaymentPlan,
  PaymentPlanPayload,
  StructureLevel,
  StructureSavePayload,
  StructureStatus,
} from '@/types';

import {
  ALL_METHODS,
  chargedIn,
  dueDateFor,
  FEE_CATEGORIES,
  levelSection,
  nextId,
  structureFor,
  SUGGESTED_ITEMS,
  type FeeItemRec,
  type FinanceData,
  type TermRef,
} from '../finance-db';
import { addDays, daysBetween, isoToday, levelRank, sum } from '../finance-ledger';
import { fmtDate, plural } from './academics-shared';
import {
  branchNameOf,
  finFor,
  historyEntry,
  naira,
  requireDate,
  requireMoney,
  termOf,
  type FinCtx,
} from './finance-shared';
import { requireText } from './shared';

const r = routesPath.finance;

/** Class levels a branch runs, in section order. */
export function branchLevels(ctx: FinCtx, branchId: string) {
  const order = (section: string) => ctx.acad.sections.findIndex((s) => s.name === section);
  const seen = new Map<string, string>();
  for (const l of ctx.acad.levels
    .filter((l) => l.branchId === branchId)
    .sort((a, b) => order(a.section) - order(b.section) || levelRank(a.name) - levelRank(b.name)))
    if (!seen.has(l.name)) seen.set(l.name, l.section);
  return [...seen].map(([name, section]) => ({ name, section }));
}

const enrolled = (ctx: FinCtx, branchId: string, level: string) =>
  [...ctx.students.values()].filter((s) => s.active && s.branchId === branchId && s.level === level)
    .length;

const activeBranches = (ctx: FinCtx) => ctx.data.branches.filter((b) => b.status === 'Active');

export const structureStatus = (
  fin: FinanceData,
  termId: string,
  branchId: string,
): StructureStatus => structureFor(fin, termId, branchId)?.status ?? 'Not created';

function itemView(ctx: FinCtx, i: FeeItemRec): FeeItem {
  return {
    ...i,
    invoiceLines: sum(
      ctx.fin.invoices.map((inv) => inv.lines.filter((l) => l.itemId === i.id).length),
    ),
  };
}

/** Terms Finance plans for: every term of the active and upcoming sessions. */
function planningTerms(ctx: FinCtx) {
  const sessions = ctx.acad.sessions.filter(
    (s) => s.status === 'Active' || s.status === 'Upcoming',
  );
  return ctx.terms.filter((t) => sessions.some((s) => s.name === t.session));
}

function nextTerm(ctx: FinCtx, t: TermRef) {
  const list = planningTerms(ctx).sort((a, b) => a.start.localeCompare(b.start));
  return list[list.findIndex((x) => x.id === t.id) + 1] ?? null;
}

function prerequisites(ctx: FinCtx) {
  const out: string[] = [];
  if (!planningTerms(ctx).length) out.push('Academic Session');
  if (!ctx.acad.levels.length) out.push('Classes & Arms');
  return out;
}

function feeNotices(ctx: FinCtx, term: TermRef): FinanceNotice[] {
  const out: FinanceNotice[] = [];
  const next = nextTerm(ctx, term);
  for (const b of activeBranches(ctx)) {
    if (structureStatus(ctx.fin, term.id, b.id) !== 'Published' && branchLevels(ctx, b.id).length)
      out.push({
        tone: 'warning',
        title: `${term.name} fees not published at ${b.name}`,
        description: 'Invoices can only be created from a published fee structure.',
        action: {
          label: 'Open structure',
          to: { name: r.fees.name, query: { tab: 'structures', term: term.id, branch: b.id } },
        },
      });
  }
  if (next && ctx.fin.items.length) {
    const missing = activeBranches(ctx).filter(
      (b) => structureStatus(ctx.fin, next.id, b.id) === 'Not created',
    );
    if (missing.length && daysBetween(isoToday(), next.start) <= 100)
      out.push({
        tone: 'warning',
        title: `${next.name} fee structures not created`,
        description: `${next.name} starts ${fmtDate(next.start)}. Copy ${term.name}’s amounts as a draft, review them, then publish before issuing invoices.`,
        action: {
          label: 'Open structure',
          to: {
            name: r.fees.name,
            query: { tab: 'structures', term: next.id, branch: missing[0]!.id },
          },
        },
      });
  }
  return out;
}

mock.get('/v1/finance/fees', (req): FeesOverview => {
  const ctx = finFor(req);
  const term = planningTerms(ctx).length ? termOf(ctx, req.query.term, req.query.session) : null;
  const structures = planningTerms(ctx).flatMap((t) =>
    activeBranches(ctx).map((b) => {
      const st = structureFor(ctx.fin, t.id, b.id);
      const totals = branchLevels(ctx, b.id)
        .map((l) => compulsoryTotal(ctx, st?.amounts[l.name] ?? {}, t, false))
        .filter((n) => n > 0);
      return {
        termId: t.id,
        term: t.name,
        session: t.session,
        termStatus:
          ctx.acad.sessions.flatMap((s) => s.terms).find((x) => x.id === t.id)?.status ?? '',
        branchId: b.id,
        branch: b.name,
        status: st?.status ?? ('Not created' as const),
        levels: Object.keys(st?.amounts ?? {}).length,
        compulsoryRange: totals.length
          ? ([Math.min(...totals), Math.max(...totals)] as [number, number])
          : null,
        invoices: ctx.fin.invoices.filter(
          (i) => i.termId === t.id && i.branchId === b.id && i.status !== 'Cancelled',
        ).length,
        publishedOn: st?.publishedOn ?? null,
      };
    }),
  );
  return {
    started: ctx.fin.items.length > 0,
    items: ctx.fin.items.map((i) => itemView(ctx, i)),
    structures,
    notices: term ? feeNotices(ctx, term) : [],
    suggested: SUGGESTED_ITEMS.map(([name, category, charged, type]) => ({
      name,
      category,
      charged,
      type,
    })),
    prerequisites: prerequisites(ctx),
  };
});

function compulsoryTotal(
  ctx: FinCtx,
  amounts: Record<string, number | null>,
  term: TermRef,
  isNew: boolean,
) {
  return sum(
    ctx.fin.items
      .filter(
        (i) => i.status === 'Active' && i.type === 'Compulsory' && chargedIn(i, term.index, isNew),
      )
      .map((i) => amounts[i.id] ?? 0),
  );
}

/** Starts Finance with suggested items (and draft amounts for the current term) or Tuition only. */
mock.post('/v1/finance/fees/start', (req) => {
  const ctx = finFor(req);
  const pre = prerequisites(ctx);
  if (pre.length) throw new MockHttpError(409, `Finish ${pre.join(' and ')} first.`);
  if (ctx.fin.items.length) throw new MockHttpError(409, 'Fee items already exist.');
  const mode = (req.body as { mode?: string })?.mode === 'tuition' ? 'tuition' : 'suggested';
  const rows = mode === 'tuition' ? SUGGESTED_ITEMS.slice(0, 1) : SUGGESTED_ITEMS;
  for (const [name, category, charged, type] of rows)
    ctx.fin.items.push({
      id: nextId(ctx.fin, 'fi'),
      name,
      category,
      charged,
      type,
      status: 'Active',
      description: '',
    });
  const term = termOf(ctx);
  for (const b of activeBranches(ctx)) {
    const amounts: Record<string, Record<string, number | null>> = {};
    for (const l of branchLevels(ctx, b.id)) {
      const code = levelSection(l.name);
      amounts[l.name] = Object.fromEntries(
        ctx.fin.items.map((i) => {
          const s = SUGGESTED_ITEMS.find(([n]) => n === i.name);
          return [i.id, mode === 'suggested' && s ? (s[4][code] ?? null) : null];
        }),
      );
    }
    ctx.fin.structures.push({
      termId: term.id,
      branchId: b.id,
      status: 'Draft',
      publishedOn: null,
      amounts,
      history: [historyEntry('Draft created', ctx.actor)],
    });
  }
  ctx.log('finance', 'Fee items added', `${plural(rows.length, 'item')}`);
  return { items: ctx.fin.items.length };
});

/* ---------------- Fee items ---------------- */

function itemPayload(ctx: FinCtx, body: unknown, exceptId?: string): FeeItemPayload {
  const p = (body ?? {}) as Partial<FeeItemPayload>;
  const name = requireText(p.name, 'Name the fee.');
  if (ctx.fin.items.some((i) => i.id !== exceptId && i.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, `A fee item called ${name} already exists.`);
  if (!FEE_CATEGORIES.includes(p.category as never))
    throw new MockHttpError(422, 'Choose a category.');
  if (!['Every term', 'Once a session', 'New students only'].includes(p.charged ?? ''))
    throw new MockHttpError(422, 'Choose when it is charged.');
  if (!['Compulsory', 'Optional'].includes(p.type ?? ''))
    throw new MockHttpError(422, 'Choose compulsory or optional.');
  return {
    name,
    category: p.category!,
    charged: p.charged!,
    type: p.type!,
    description: (p.description ?? '').trim(),
  };
}

mock.post('/v1/finance/fees/items', (req) => {
  const ctx = finFor(req);
  const p = itemPayload(ctx, req.body);
  const item: FeeItemRec = { id: nextId(ctx.fin, 'fi'), ...p, status: 'Active' };
  ctx.fin.items.push(item);
  ctx.log('finance', `Fee item added: ${item.name}`, `${item.type} · ${item.charged}`);
  return itemView(ctx, item);
});

mock.put('/v1/finance/fees/items/:id', (req) => {
  const ctx = finFor(req);
  const item = ctx.fin.items.find((i) => i.id === req.params.id);
  if (!item) throw new MockHttpError(404, 'Fee item not found');
  const p = itemPayload(ctx, req.body, item.id);
  if (
    item.category === 'Tuition' &&
    p.type === 'Optional' &&
    ctx.fin.items.filter(
      (i) => i.category === 'Tuition' && i.type === 'Compulsory' && i.status === 'Active',
    ).length === 1
  )
    throw new MockHttpError(422, 'Keep at least one compulsory tuition fee.');
  Object.assign(item, p);
  ctx.log('finance', `Fee item updated: ${item.name}`);
  return itemView(ctx, item);
});

/** Removes an unused item, or archives one invoices already carry. */
mock.delete('/v1/finance/fees/items/:id', (req) => {
  const ctx = finFor(req);
  const item = ctx.fin.items.find((i) => i.id === req.params.id);
  if (!item) throw new MockHttpError(404, 'Fee item not found');
  const used = itemView(ctx, item).invoiceLines;
  if (
    item.type === 'Compulsory' &&
    ctx.fin.items.filter(
      (i) => i.type === 'Compulsory' && i.status === 'Active' && i.id !== item.id,
    ).length === 0
  )
    throw new MockHttpError(422, 'Keep at least one compulsory fee, such as Tuition.');
  if (used) {
    item.status = 'Archived';
    ctx.log(
      'finance',
      `Fee item archived: ${item.name}`,
      `${plural(used, 'invoice line')} keep it`,
    );
    return { archived: true };
  }
  ctx.fin.items = ctx.fin.items.filter((i) => i.id !== item.id);
  for (const st of ctx.fin.structures)
    for (const lv of Object.values(st.amounts)) delete lv[item.id];
  ctx.log('finance', `Fee item removed: ${item.name}`);
  return { archived: false };
});

mock.post('/v1/finance/fees/items/:id/restore', (req) => {
  const ctx = finFor(req);
  const item = ctx.fin.items.find((i) => i.id === req.params.id);
  if (!item) throw new MockHttpError(404, 'Fee item not found');
  item.status = 'Active';
  return itemView(ctx, item);
});

/* ---------------- Structures ---------------- */

function structureView(ctx: FinCtx, term: TermRef, branchId: string): FeeStructureView {
  const st = structureFor(ctx.fin, term.id, branchId);
  const items = ctx.fin.items
    .filter((i) => i.status === 'Active')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'Compulsory' ? -1 : 1))
    .map((i) => ({
      ...itemView(ctx, i),
      chargedThisTerm: i.charged !== 'Once a session' || term.index === 0,
    }));
  const levels = branchLevels(ctx, branchId);
  const sections = new Map<string, StructureLevel[]>();
  let students = 0;
  let projected = 0;
  for (const l of levels) {
    const amounts = Object.fromEntries(
      items.map((i) => [i.id, st?.amounts[l.name]?.[i.id] ?? null]),
    );
    const n = enrolled(ctx, branchId, l.name);
    const compulsory = compulsoryTotal(ctx, amounts, term, false);
    students += n;
    projected += n * compulsory;
    const row: StructureLevel = {
      id: l.name,
      name: l.name,
      section: l.section,
      students: n,
      amounts,
      compulsoryTotal: compulsory,
      optionalTotal: sum(items.filter((i) => i.type === 'Optional').map((i) => amounts[i.id] ?? 0)),
      missing: items
        .filter(
          (i) => i.type === 'Compulsory' && i.charged === 'Every term' && amounts[i.id] == null,
        )
        .map((i) => i.name),
    };
    sections.set(l.section, [...(sections.get(l.section) ?? []), row]);
  }
  const terms = planningTerms(ctx);
  const notices: FinanceNotice[] = [];
  const issued = ctx.fin.invoices.filter(
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
      title: `No ${term.name} structure at ${branchNameOf(ctx, branchId)} yet`,
      description: 'Copy another term’s or branch’s amounts, or enter them here.',
    });
  return {
    term: { id: term.id, name: term.name, session: term.session, start: term.start, end: term.end },
    branch: { id: branchId, name: branchNameOf(ctx, branchId) },
    status: st?.status ?? 'Not created',
    publishedOn: st?.publishedOn ?? null,
    items,
    sections: [...sections].map(([name, lv]) => ({ name, levels: lv })),
    students,
    projected,
    invoicesIssued: issued,
    terms: terms.map((t) => ({
      id: t.id,
      name: t.name,
      session: t.session,
      status: ctx.acad.sessions.flatMap((s) => s.terms).find((x) => x.id === t.id)?.status ?? '',
    })),
    branches: activeBranches(ctx).map((b) => ({ id: b.id, name: b.name })),
    statuses: Object.fromEntries(
      terms.map((t) => [t.id, structureStatus(ctx.fin, t.id, branchId)]),
    ),
    otherBranches: activeBranches(ctx)
      .filter((b) => b.id !== branchId)
      .map((b) => ({ id: b.id, name: b.name, status: structureStatus(ctx.fin, term.id, b.id) })),
    notices,
  };
}

const branchFrom = (ctx: FinCtx, id?: string) => {
  const b = activeBranches(ctx).find((x) => x.id === id || x.name === id) ?? activeBranches(ctx)[0];
  if (!b) throw new MockHttpError(409, 'Add a branch first.');
  return b.id;
};

mock.get('/v1/finance/fees/structure', (req) => {
  const ctx = finFor(req);
  return structureView(
    ctx,
    termOf(ctx, req.query.term, req.query.session),
    branchFrom(ctx, req.query.branch),
  );
});

function cleanAmounts(ctx: FinCtx, branchId: string, raw: StructureSavePayload['amounts']) {
  const levels = branchLevels(ctx, branchId).map((l) => l.name);
  const out: Record<string, Record<string, number | null>> = {};
  const bad: string[] = [];
  for (const level of levels) {
    out[level] = {};
    for (const item of ctx.fin.items) {
      const v = raw?.[level]?.[item.id];
      if (v === null || v === undefined || (v as unknown) === '') {
        out[level]![item.id] = null;
        continue;
      }
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10_000_000) {
        bad.push(`${level} · ${item.name}`);
        continue;
      }
      out[level]![item.id] = v;
    }
  }
  if (bad.length)
    throw new MockHttpError(
      422,
      `${plural(bad.length, 'amount')} need fixing: whole naira up to ₦10,000,000 (${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}).`,
    );
  return out;
}

mock.put('/v1/finance/fees/structure', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as StructureSavePayload;
  const term = termOf(ctx, p.termId);
  const branchId = branchFrom(ctx, p.branchId);
  const amounts = cleanAmounts(ctx, branchId, p.amounts);
  let st = structureFor(ctx.fin, term.id, branchId);
  if (!st) {
    st = { termId: term.id, branchId, status: 'Draft', publishedOn: null, amounts, history: [] };
    ctx.fin.structures.push(st);
  } else st.amounts = amounts;
  st.history.push(
    historyEntry(st.status === 'Published' ? 'Amounts changed' : 'Draft saved', ctx.actor),
  );
  ctx.log('finance', `${term.name} fees saved · ${branchNameOf(ctx, branchId)}`);
  return structureView(ctx.refresh(), term, branchId);
});

mock.post('/v1/finance/fees/structure/publish', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as { termId?: string; branchId?: string };
  const term = termOf(ctx, p.termId);
  const branchId = branchFrom(ctx, p.branchId);
  const st = structureFor(ctx.fin, term.id, branchId);
  if (!st) throw new MockHttpError(422, 'Enter amounts before publishing.');
  const view = structureView(ctx, term, branchId);
  if (!ctx.fin.items.some((i) => i.status === 'Active' && i.type === 'Compulsory'))
    throw new MockHttpError(422, 'Add at least one compulsory fee, such as Tuition.');
  const gaps = view.sections
    .flatMap((s) => s.levels)
    .filter((l) => l.students > 0 && (l.missing.length || l.compulsoryTotal === 0));
  if (gaps.length)
    throw new MockHttpError(
      422,
      `${plural(gaps.length, 'class', 'classes')} with students ${gaps.length === 1 ? 'has' : 'have'} compulsory fees left blank: ${gaps
        .slice(0, 4)
        .map((l) => `${l.name} (${l.missing.join(', ') || 'no fees'})`)
        .join('; ')}.`,
    );
  st.status = 'Published';
  st.publishedOn = isoToday();
  st.history.push(historyEntry('Published', ctx.actor, 'success'));
  ctx.log('finance', `${term.name} fees published · ${branchNameOf(ctx, branchId)}`);
  return structureView(ctx.refresh(), term, branchId);
});

mock.post('/v1/finance/fees/structure/copy', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as {
    fromTermId?: string;
    toTermId?: string;
    branchId?: string;
    fromBranchId?: string;
    allBranches?: boolean;
  };
  const from = termOf(ctx, p.fromTermId);
  const to = termOf(ctx, p.toTermId);
  const targets = p.allBranches
    ? activeBranches(ctx).map((b) => b.id)
    : [branchFrom(ctx, p.branchId)];
  let copied = 0;
  for (const branchId of targets) {
    const source = structureFor(
      ctx.fin,
      from.id,
      p.fromBranchId ? branchFrom(ctx, p.fromBranchId) : branchId,
    );
    if (!source) continue;
    const existing = structureFor(ctx.fin, to.id, branchId);
    if (existing?.status === 'Published')
      throw new MockHttpError(
        409,
        `${to.name} fees at ${branchNameOf(ctx, branchId)} are already published. Edit the amounts instead.`,
      );
    const levels = branchLevels(ctx, branchId).map((l) => l.name);
    const amounts = Object.fromEntries(levels.map((l) => [l, { ...source.amounts[l] }]));
    if (existing) existing.amounts = amounts;
    else
      ctx.fin.structures.push({
        termId: to.id,
        branchId,
        status: 'Draft',
        publishedOn: null,
        amounts,
        history: [],
      });
    structureFor(ctx.fin, to.id, branchId)!.history.push(
      historyEntry(
        `Copied from ${from.name}${p.fromBranchId ? ` at ${branchNameOf(ctx, branchFrom(ctx, p.fromBranchId))}` : ''}`,
        ctx.actor,
      ),
    );
    copied++;
  }
  if (!copied) throw new MockHttpError(422, `There are no ${from.name} amounts to copy.`);
  ctx.log('finance', `Fees copied to ${to.name}`, plural(copied, 'branch', 'branches'));
  return structureView(ctx.refresh(), to, targets[0]!);
});

/* ---------------- Discounts ---------------- */

function discountView(ctx: FinCtx, d: FinanceData['discounts'][number]): Discount {
  const session = ctx.terms.find((t) => t.id === termOf(ctx).id)?.session;
  const lines = ctx.fin.invoices
    .filter(
      (i) =>
        i.status !== 'Cancelled' && ctx.terms.find((t) => t.id === i.termId)?.session === session,
    )
    .flatMap((i) => i.discounts.filter((x) => x.discountId === d.id));
  const value = d.kind === 'Percentage' ? `${d.value}%` : naira(d.value);
  return {
    ...d,
    automatic: d.basis === 'Sibling',
    applied: lines.length,
    given: sum(lines.map((l) => l.amount)),
    description:
      d.basis === 'Sibling'
        ? `${value} off ${d.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory fees'} · ${d.fromChild === 3 ? '3rd' : '2nd'} child onwards of the same fee payer`
        : `${d.basis === 'Custom' ? 'Up to ' : ''}${value} off ${d.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory fees'}${d.needsApproval ? ' · approval recorded' : ''}`,
  };
}

function discountPayload(ctx: FinCtx, body: unknown, exceptId?: string): DiscountPayload {
  const p = (body ?? {}) as Partial<DiscountPayload>;
  const name = requireText(p.name, 'Name the discount.');
  if (
    ctx.fin.discounts.some((d) => d.id !== exceptId && d.name.toLowerCase() === name.toLowerCase())
  )
    throw new MockHttpError(422, 'A discount with that name already exists.');
  if (!['Sibling', 'Staff child', 'Scholarship', 'Custom'].includes(p.basis ?? ''))
    throw new MockHttpError(422, 'Choose what the discount is for.');
  if (
    p.basis === 'Sibling' &&
    ctx.fin.discounts.some(
      (d) => d.id !== exceptId && d.basis === 'Sibling' && d.status === 'Active',
    )
  )
    throw new MockHttpError(422, 'Only one sibling rule can apply. Edit the existing one.');
  const kind = p.kind === 'Percentage' ? 'Percentage' : 'Fixed amount';
  const value = Number(p.value);
  if (!Number.isFinite(value) || value <= 0) throw new MockHttpError(422, 'Enter a value above 0.');
  if (kind === 'Percentage' && value > 100)
    throw new MockHttpError(422, 'A percentage must be between 1 and 100.');
  return {
    name,
    basis: p.basis!,
    kind,
    value: Math.round(value),
    appliesTo: p.appliesTo === 'All compulsory items' ? 'All compulsory items' : 'Tuition only',
    fromChild: p.fromChild === 3 ? 3 : 2,
    needsApproval: p.basis === 'Sibling' ? false : p.needsApproval !== false,
    status: p.status === 'Inactive' ? 'Inactive' : 'Active',
  };
}

mock.get('/v1/finance/discounts', (req) => {
  const ctx = finFor(req);
  return ctx.fin.discounts.map((d) => discountView(ctx, d));
});
mock.post('/v1/finance/discounts', (req) => {
  const ctx = finFor(req);
  const d = { id: nextId(ctx.fin, 'dc'), ...discountPayload(ctx, req.body) };
  ctx.fin.discounts.push(d);
  ctx.log('finance', `Discount added: ${d.name}`);
  return discountView(ctx, d);
});
mock.put('/v1/finance/discounts/:id', (req) => {
  const ctx = finFor(req);
  const d = ctx.fin.discounts.find((x) => x.id === req.params.id);
  if (!d) throw new MockHttpError(404, 'Discount not found');
  Object.assign(d, discountPayload(ctx, req.body, d.id));
  ctx.log('finance', `Discount updated: ${d.name}`, 'applies to invoices created from now on');
  return discountView(ctx, d);
});

/* ---------------- Payment plans ---------------- */

function planView(ctx: FinCtx, p: FinanceData['plans'][number]): PaymentPlan {
  const term = termOf(ctx);
  const invs = ctx.fin.invoices.filter(
    (i) => i.termId === term.id && i.planId === p.id && i.status === 'Issued',
  );
  return {
    ...p,
    students: invs.length,
    overdue: invs.filter((i) => ctx.ledger.invoice(i.id).overdue).length,
    schedule: p.split
      .map((pct, i) => `${pct}% by ${fmtDate(addDays(term.start, p.offsets[i] ?? 0), false)}`)
      .join(' · '),
  };
}

function planPayload(ctx: FinCtx, body: unknown, exceptId?: string): PaymentPlanPayload {
  const p = (body ?? {}) as Partial<PaymentPlanPayload>;
  const name = requireText(p.name, 'Name the plan.');
  if (ctx.fin.plans.some((x) => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, 'A plan with that name already exists.');
  const split = (p.split ?? []).map(Number);
  const offsets = (p.offsets ?? []).map(Number);
  if (!split.length || split.some((n) => !Number.isInteger(n) || n <= 0))
    throw new MockHttpError(422, 'Each part must be a whole percentage above 0.');
  if (sum(split) !== 100)
    throw new MockHttpError(422, `Parts add up to ${sum(split)}%. They must total 100.`);
  if (offsets.length !== split.length || offsets.some((n) => !Number.isInteger(n) || n < 0))
    throw new MockHttpError(422, 'Give one due day (days after the term starts) for each part.');
  if (offsets.some((n, i) => i > 0 && n <= offsets[i - 1]!))
    throw new MockHttpError(422, 'Each due day must be later than the one before.');
  const shortest = Math.min(...planningTerms(ctx).map((t) => daysBetween(t.start, t.end)));
  if (Number.isFinite(shortest) && offsets[offsets.length - 1]! > shortest)
    throw new MockHttpError(
      422,
      `The last part falls after the end of the shortest term (${shortest} days).`,
    );
  return { name, split, offsets };
}

mock.get('/v1/finance/plans', (req) => {
  const ctx = finFor(req);
  return ctx.fin.plans.map((p) => planView(ctx, p));
});
mock.post('/v1/finance/plans', (req) => {
  const ctx = finFor(req);
  const p = {
    id: nextId(ctx.fin, 'plan'),
    ...planPayload(ctx, req.body),
    isDefault: false,
    status: 'Active' as const,
  };
  ctx.fin.plans.push(p);
  ctx.log('finance', `Payment plan added: ${p.name}`);
  return planView(ctx, p);
});
mock.put('/v1/finance/plans/:id', (req) => {
  const ctx = finFor(req);
  const p = ctx.fin.plans.find((x) => x.id === req.params.id);
  if (!p) throw new MockHttpError(404, 'Plan not found');
  Object.assign(p, planPayload(ctx, req.body, p.id));
  ctx.log('finance', `Payment plan updated: ${p.name}`);
  return planView(ctx.refresh(), p);
});
mock.post('/v1/finance/plans/:id/default', (req) => {
  const ctx = finFor(req);
  const p = ctx.fin.plans.find((x) => x.id === req.params.id);
  if (!p) throw new MockHttpError(404, 'Plan not found');
  for (const x of ctx.fin.plans) x.isDefault = x.id === p.id;
  p.status = 'Active';
  return planView(ctx, p);
});
mock.post('/v1/finance/plans/:id/toggle', (req) => {
  const ctx = finFor(req);
  const p = ctx.fin.plans.find((x) => x.id === req.params.id);
  if (!p) throw new MockHttpError(404, 'Plan not found');
  if (p.isDefault) throw new MockHttpError(422, 'Choose another default plan first.');
  p.status = p.status === 'Active' ? 'Inactive' : 'Active';
  return planView(ctx, p);
});

/* ---------------- Settings ---------------- */

export function settingsView(ctx: FinCtx): FinanceSettings {
  const { dueDates: _d, ...rest } = ctx.fin.settings;
  return {
    ...rest,
    dueDates: planningTerms(ctx).map((t) => ({
      termId: t.id,
      term: t.name,
      session: t.session,
      start: t.start,
      end: t.end,
      due: dueDateFor(ctx.fin, t),
    })),
  };
}

mock.get('/v1/finance/settings', (req) => settingsView(finFor(req)));

mock.put('/v1/finance/settings', (req: MockRequest) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as Partial<FinanceSettingsPayload>;
  const prefix = (v: unknown, label: string) => {
    if (typeof v !== 'string' || !/^[A-Z]{2,5}$/.test(v))
      throw new MockHttpError(422, `${label} must be 2–5 capital letters.`);
    return v;
  };
  const invoicePrefix = prefix(p.invoicePrefix, 'Invoice prefix');
  const receiptPrefix = prefix(p.receiptPrefix, 'Receipt prefix');
  if (invoicePrefix === receiptPrefix)
    throw new MockHttpError(422, 'The receipt prefix must differ from the invoice prefix.');
  const methods = (p.methods ?? []).filter((m) => ALL_METHODS.includes(m));
  if (!methods.length) throw new MockHttpError(422, 'Pick at least one payment method.');
  const lateKind = p.lateFee?.kind ?? 'None';
  const lateValue = lateKind === 'None' ? 0 : Number(p.lateFee?.value);
  if (lateKind === 'Percentage' && !(lateValue >= 1 && lateValue <= 50))
    throw new MockHttpError(422, 'A late fee percentage must be between 1 and 50.');
  if (lateKind === 'Fixed amount') requireMoney(lateValue, 'Enter the late fee in naira.');
  const due: Record<string, string> = { ...ctx.fin.settings.dueDates };
  for (const [termId, date] of Object.entries(p.dueDates ?? {})) {
    const t = ctx.terms.find((x) => x.id === termId);
    if (!t) continue;
    requireDate(date, `Choose a due date for ${t.name}.`);
    if (date < addDays(t.start, -30) || date > t.end)
      throw new MockHttpError(
        422,
        `${t.name}’s due date must fall between a month before it starts and ${fmtDate(t.end)}.`,
      );
    due[termId] = date;
  }
  ctx.fin.settings = {
    dueDates: due,
    allowPartial: p.allowPartial !== false,
    autoSibling: p.autoSibling !== false,
    verifyTransfers: p.verifyTransfers !== false,
    lateFee: { kind: lateKind, value: lateValue },
    methods,
    invoicePrefix,
    receiptPrefix,
    transferReference:
      p.transferReference === 'Invoice number' ? 'Invoice number' : 'Admission number',
    expenseLimit: requireMoney(
      p.expenseLimit ?? ctx.fin.settings.expenseLimit,
      'Enter the Bursar’s approval limit.',
    ),
    refundLimit: requireMoney(
      p.refundLimit ?? ctx.fin.settings.refundLimit,
      'Enter the Principal’s refund limit.',
    ),
  };
  ctx.log('finance', 'Finance settings updated');
  return settingsView(ctx);
});

export { planningTerms };
