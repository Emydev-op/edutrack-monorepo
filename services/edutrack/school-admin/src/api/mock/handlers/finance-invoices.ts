import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  GeneratePayload,
  GeneratePreview,
  InvoiceDetail,
  InvoiceList,
  InvoiceRow,
  InvoiceStatus,
  PayerSearchRow,
  StudentAccount,
} from '@/types';

import {
  buildInvoice,
  discountAmount,
  dueDateFor,
  issueInvoice,
  nextId,
  structureFor,
  type FinStudent,
  type InvoiceRec,
  type TermRef,
} from '../finance-db';
import { feeReminders, invoicesIssued, paymentDetailsSent } from '../comms-events';
import { isoToday, levelRank, siblingPositions, sum, totalOf } from '../finance-ledger';
import { fmtDate, plural } from './academics-shared';
import {
  allStudents,
  branchNameOf,
  branchScope,
  classOf,
  finFor,
  historyEntry,
  invoiceRow,
  naira,
  openInvoices,
  outstandingOf,
  paymentRow,
  payTo,
  refundRow,
  requireMoney,
  showHistory,
  studentOf,
  termOf,
  type FinCtx,
} from './finance-shared';
import { requireText } from './shared';

const r = routesPath.finance;
const SMS_COST = 4;

function findInvoice(ctx: FinCtx, id: string) {
  const inv = ctx.fin.invoices.find((i) => i.id === id || i.no === id);
  if (!inv) throw new MockHttpError(404, 'Invoice not found');
  return inv;
}
const live = (inv: InvoiceRec) => {
  if (inv.status === 'Cancelled') throw new MockHttpError(409, 'This invoice is cancelled.');
  return inv;
};

/* ---------------- List ---------------- */

mock.get('/v1/finance/invoices', (req): InvoiceList => {
  const ctx = finFor(req);
  const q = req.query;
  const branchId = branchScope(ctx, q.branch);
  const term = q.term === 'all' ? null : termOf(ctx, q.term, q.session);
  const scoped = ctx.fin.invoices.filter(
    (i) => (!term || i.termId === term.id) && (!branchId || i.branchId === branchId),
  );
  const rows = scoped.map((i) => invoiceRow(ctx, i));
  const counts = { All: rows.length } as Record<InvoiceStatus | 'All', number>;
  for (const s of ['Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'] as const)
    counts[s] = rows.filter((x) => x.status === s).length;
  const billedRows = rows.filter((x) => x.status !== 'Draft' && x.status !== 'Cancelled');
  const billed = sum(billedRows.map((x) => x.total));
  const collected = sum(billedRows.map((x) => x.paid));
  const search = (q.search ?? '').trim().toLowerCase();
  const filtered = rows
    .filter((x) => (!q.status ? true : q.status === 'Open' ? x.balance > 0 : x.status === q.status))
    .filter((x) => !q.level || x.className.startsWith(q.level))
    .filter(
      (x) =>
        !search ||
        `${x.no} ${x.student} ${x.admissionNo} ${x.payer ?? ''} ${x.className}`
          .toLowerCase()
          .includes(search),
    )
    .sort((a, b) => b.no.localeCompare(a.no) * -1);
  const pageSize = Number(q.pageSize ?? 25);
  const page = Math.max(1, Number(q.page ?? 1));
  const uninvoiced = term
    ? eligible(ctx, term, branchId).filter((s) => !hasInvoice(ctx, s.key, term.id)).length
    : 0;
  const lateFeeCandidates = lateFeeTargets(ctx, term, branchId).length;
  const notices: InvoiceList['notices'] = [];
  if (uninvoiced && term)
    notices.push({
      tone: 'warning',
      title: `${plural(uninvoiced, 'student')} ${uninvoiced === 1 ? 'has' : 'have'} no ${term.name} invoice`,
      description:
        'Usually students admitted after invoices were issued. Generate their invoices from the fee structure.',
      action: {
        label: 'Generate invoices',
        to: { name: r.invoiceGenerate.name, query: { term: term.id } },
      },
    });
  if (counts.Draft)
    notices.push({
      tone: 'info',
      title: `${plural(counts.Draft, 'draft invoice')} not issued`,
      description: 'Drafts aren’t sent to parents and don’t count as billed until you issue them.',
      action: {
        label: 'Show drafts',
        to: { name: r.invoices.name, query: { status: 'Draft', ...(term && { term: term.id }) } },
      },
    });
  return {
    data: filtered.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    },
    summary: {
      billed,
      collected,
      outstanding: sum(billedRows.map((x) => x.balance)),
      overdue: sum(billedRows.filter((x) => x.overdue).map((x) => x.balance)),
      overdueCount: billedRows.filter((x) => x.overdue).length,
      counts,
      rate: billed ? Math.round((collected / billed) * 100) : 0,
    },
    levels: [...new Set(scoped.map((i) => i.level))].sort((a, b) => levelRank(a) - levelRank(b)),
    terms: ctx.terms
      .filter((t) => ctx.fin.invoices.some((i) => i.termId === t.id) || t.id === term?.id)
      .map((t) => ({ id: t.id, name: t.name, session: t.session })),
    notices,
    uninvoiced,
    lateFeeCandidates,
  };
});

/* ---------------- Detail ---------------- */

export function invoiceDetail(ctx: FinCtx, inv: InvoiceRec): InvoiceDetail {
  const row = invoiceRow(ctx, inv);
  const st = ctx.ledger.invoice(inv.id);
  const s = ctx.students.get(inv.studentKey);
  const structure = structureFor(ctx.fin, inv.termId, inv.branchId)?.amounts[inv.level] ?? {};
  const allocations = [
    ...ctx.fin.payments.flatMap((p) =>
      p.allocations
        .filter((a) => a.invoiceId === inv.id)
        .map((a) => ({
          paymentId: p.id,
          receipt: p.no,
          date: p.date,
          method: p.method,
          amount: a.amount,
          status: p.status,
          recordedBy: p.recordedBy,
        })),
    ),
    ...ctx.fin.creditUses
      .filter((c) => c.invoiceId === inv.id)
      .map((c) => ({
        paymentId: '',
        receipt: 'Credit',
        date: c.date,
        method: 'Credit on account' as never,
        amount: c.amount,
        status: 'Credit applied' as const,
        recordedBy: c.by,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set(inv.discounts.map((d) => d.discountId));
  const credit = ctx.ledger.credit(inv.studentKey);
  return {
    ...row,
    level: inv.level,
    arm: inv.arm,
    lines: inv.lines.map((l) => ({ ...l, removable: inv.status !== 'Cancelled' })),
    discounts: inv.discounts,
    subtotal: sum(inv.lines.map((l) => l.amount)),
    discountTotal: sum(inv.discounts.map((d) => d.amount)),
    plan: ctx.fin.plans.find((p) => p.id === inv.planId)
      ? { id: inv.planId!, name: ctx.fin.plans.find((p) => p.id === inv.planId)!.name }
      : null,
    installments: st.installments,
    allocations,
    cancelled: inv.cancelled,
    notified: inv.notified,
    credit,
    otherOpen: openInvoices(ctx, inv.studentKey)
      .filter((i) => i.id !== inv.id)
      .map((i) => {
        const t = ctx.terms.find((x) => x.id === i.termId);
        return {
          id: i.id,
          no: i.no,
          term: `${t?.session} · ${t?.name}`,
          balance: ctx.ledger.invoice(i.id).balance,
          status: ctx.ledger.invoice(i.id).status,
        };
      }),
    optionalAvailable: ctx.fin.items
      .filter(
        (i) =>
          i.status === 'Active' &&
          i.type === 'Optional' &&
          structure[i.id] &&
          !inv.lines.some((l) => l.itemId === i.id),
      )
      .map((i) => ({ itemId: i.id, name: i.name, amount: structure[i.id]! })),
    discountsAvailable: ctx.fin.discounts
      .filter((d) => d.status === 'Active' && d.basis !== 'Sibling' && !used.has(d.id))
      .map((d) => ({
        id: d.id,
        name: d.name,
        basis: d.basis,
        amount: discountAmount(ctx.fin, inv, d),
        needsApproval: d.needsApproval,
      })),
    plans: ctx.fin.plans
      .filter((p) => p.status === 'Active')
      .map((p) => ({ id: p.id, name: p.name })),
    payTo: s && st.balance > 0 ? payTo(ctx, s, outstandingOf(ctx, s.key)) : null,
    history: showHistory(inv.history),
    canCancel:
      inv.status === 'Cancelled'
        ? { ok: false, reason: 'Already cancelled.' }
        : {
            ok: true,
            reason:
              st.paid > 0
                ? `${naira(st.paid)} already paid moves to ${s?.name ?? 'the student'}’s credit, to apply elsewhere or refund.`
                : '',
          },
  };
}

mock.get('/v1/finance/invoices/:id', (req) => {
  const ctx = finFor(req);
  return invoiceDetail(ctx, findInvoice(ctx, req.params.id!));
});

/* ---------------- Generate & issue ---------------- */

const hasInvoice = (ctx: FinCtx, key: string, termId: string) =>
  ctx.fin.invoices.some(
    (i) => i.studentKey === key && i.termId === termId && i.status !== 'Cancelled',
  );

function eligible(ctx: FinCtx, term: TermRef, branchId: string | null, levels?: string[]) {
  return allStudents(ctx).filter(
    (s) =>
      s.active &&
      (!branchId || s.branchId === branchId) &&
      (!levels?.length || levels.includes(s.level)),
  );
}

function preview(ctx: FinCtx, p: GeneratePayload): GeneratePreview & { build: () => InvoiceRec[] } {
  const term = termOf(ctx, p.termId);
  const branchId = branchScope(ctx, p.branchId);
  const pool = eligible(ctx, term, branchId, p.levels);
  const todo = pool.filter((s) => !hasInvoice(ctx, s.key, term.id));
  const siblings = siblingPositions(allStudents(ctx).filter((s) => s.active));
  const built: InvoiceRec[] = [];
  const missing = new Set<string>();
  const levels = new Map<
    string,
    {
      level: string;
      branch: string;
      students: number;
      each: number;
      total: number;
      missing: boolean;
    }
  >();
  const seqBefore = { ...ctx.fin.seq };
  for (const s of todo) {
    const inv = buildInvoice(ctx.fin, s, term, { siblings, on: isoToday(), by: ctx.actor });
    const key = `${s.branchId}|${s.level}`;
    const row = levels.get(key) ?? {
      level: s.level,
      branch: branchNameOf(ctx, s.branchId),
      students: 0,
      each: 0,
      total: 0,
      missing: false,
    };
    row.students++;
    if (!inv) {
      row.missing = true;
      missing.add(`${s.level} · ${branchNameOf(ctx, s.branchId)}`);
    } else {
      built.push(inv);
      row.each = Math.max(row.each, sum(inv.lines.map((l) => l.amount)));
      row.total += totalOf(inv);
    }
    levels.set(key, row);
  }
  ctx.fin.seq = seqBefore;
  return {
    term: { id: term.id, name: term.name, session: term.session, start: term.start },
    due: dueDateFor(ctx.fin, term) < isoToday() ? isoToday() : dueDateFor(ctx.fin, term),
    students: pool.length,
    alreadyInvoiced: pool.length - todo.length,
    toCreate: built.length,
    total: sum(built.map(totalOf)),
    discounts: sum(built.map((i) => sum(i.discounts.map((d) => d.amount)))),
    levels: [...levels.values()].sort(
      (a, b) => a.branch.localeCompare(b.branch) || levelRank(a.level) - levelRank(b.level),
    ),
    missingStructures: [...missing],
    noGuardian: built.filter((i) => !ctx.students.get(i.studentKey)?.payer).length,
    build: () =>
      todo
        .map((s) => buildInvoice(ctx.fin, s, term, { siblings, on: isoToday(), by: ctx.actor }))
        .filter((i): i is InvoiceRec => !!i),
  };
}

mock.post('/v1/finance/invoices/generate/preview', (req) => {
  const ctx = finFor(req);
  const { build: _b, ...view } = preview(ctx, (req.body ?? {}) as GeneratePayload);
  return view;
});

mock.post('/v1/finance/invoices/generate', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as GeneratePayload;
  const pv = preview(ctx, p);
  if (!pv.toCreate)
    throw new MockHttpError(
      422,
      pv.missingStructures.length
        ? `Publish fees for ${pv.missingStructures.slice(0, 3).join(', ')} first.`
        : 'Every student in this selection already has an invoice for the term.',
    );
  const created = pv.build();
  for (const inv of created) {
    if (p.issue)
      issueInvoice(ctx.fin, inv, isoToday(), ctx.actor, !!ctx.students.get(inv.studentKey)?.payer);
    ctx.fin.invoices.push(inv);
  }
  ctx.log(
    'finance',
    `${plural(created.length, p.issue ? 'invoice' : 'draft invoice')} created for ${pv.term.name}`,
    naira(pv.total),
  );
  ctx.refresh();
  if (p.issue) invoicesIssued(ctx.schoolId, created, ctx.actor);
  return {
    created: created.length,
    issued: p.issue ? created.length : 0,
    total: pv.total,
    notified: created.filter((i) => i.notified).length,
  };
});

mock.post('/v1/finance/invoices/issue', (req) => {
  const ctx = finFor(req);
  const ids = ((req.body as { ids?: string[] })?.ids ?? []) as string[];
  const drafts = ctx.fin.invoices.filter((i) => ids.includes(i.id) && i.status === 'Draft');
  if (!drafts.length) throw new MockHttpError(422, 'Select draft invoices to issue.');
  for (const inv of drafts)
    issueInvoice(ctx.fin, inv, isoToday(), ctx.actor, !!ctx.students.get(inv.studentKey)?.payer);
  ctx.log('finance', `${plural(drafts.length, 'invoice')} issued`);
  ctx.refresh();
  invoicesIssued(ctx.schoolId, drafts, ctx.actor);
  return { issued: drafts.length, notified: drafts.filter((i) => i.notified).length };
});

/* ---------------- Reminders & late fees ---------------- */

mock.post('/v1/finance/invoices/remind', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as {
    ids?: string[];
    overdue?: boolean;
    termId?: string;
    branch?: string;
    preview?: boolean;
  };
  const branchId = branchScope(ctx, p.branch);
  const targets = p.ids?.length
    ? ctx.fin.invoices.filter((i) => p.ids!.includes(i.id))
    : ctx.fin.invoices.filter(
        (i) =>
          (!p.termId || i.termId === p.termId) &&
          (!branchId || i.branchId === branchId) &&
          ctx.ledger.invoice(i.id).overdue,
      );
  const open = targets.filter((i) => i.status === 'Issued' && ctx.ledger.invoice(i.id).balance > 0);
  const withPayer = open.filter((i) => ctx.students.get(i.studentKey)?.payer);
  const payers = new Set(withPayer.map((i) => ctx.students.get(i.studentKey)!.payer));
  const result = {
    invoices: open.length,
    recipients: payers.size,
    skipped: open.length - withPayer.length,
    cost: payers.size * SMS_COST,
    total: sum(open.map((i) => ctx.ledger.invoice(i.id).balance)),
  };
  if (p.preview) return result;
  if (!withPayer.length)
    throw new MockHttpError(
      422,
      'None of the selected invoices has a balance and a fee payer to remind.',
    );
  for (const inv of withPayer) {
    const st = ctx.ledger.invoice(inv.id);
    inv.history.push(
      historyEntry(
        st.overdue ? 'Overdue reminder sent' : 'Reminder sent',
        `${ctx.actor} · ${naira(st.balance)} · SMS and email`,
        st.overdue ? 'warning' : 'info',
      ),
    );
  }
  ctx.fin.reminders.unshift({
    date: isoToday(),
    count: payers.size,
    channel: 'SMS · Email',
    by: ctx.actor,
  });
  feeReminders(ctx.schoolId, withPayer, ctx.actor);
  ctx.log(
    'finance',
    `Fee reminders sent to ${plural(payers.size, 'fee payer')}`,
    `${naira(result.cost)} SMS credit`,
  );
  return result;
});

function lateFeeTargets(ctx: FinCtx, term: TermRef | null, branchId: string | null) {
  if (ctx.fin.settings.lateFee.kind === 'None') return [];
  return ctx.fin.invoices.filter(
    (i) =>
      (!term || i.termId === term.id) &&
      (!branchId || i.branchId === branchId) &&
      i.status === 'Issued' &&
      ctx.ledger.invoice(i.id).overdue &&
      !i.lines.some((l) => l.category === 'Late fee'),
  );
}

mock.post('/v1/finance/invoices/late-fees', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as { termId?: string; branch?: string; ids?: string[] };
  const fee = ctx.fin.settings.lateFee;
  if (fee.kind === 'None')
    throw new MockHttpError(409, 'Set a late fee in Fees › Billing settings first.');
  const term = p.termId ? termOf(ctx, p.termId) : null;
  const targets = lateFeeTargets(ctx, term, branchScope(ctx, p.branch)).filter(
    (i) => !p.ids?.length || p.ids.includes(i.id),
  );
  if (!targets.length)
    throw new MockHttpError(422, 'No overdue invoices are waiting for a late fee.');
  let total = 0;
  for (const inv of targets) {
    const bal = ctx.ledger.invoice(inv.id).balance;
    const amount =
      fee.kind === 'Fixed amount' ? fee.value : Math.round((bal * fee.value) / 100 / 100) * 100;
    total += amount;
    inv.lines.push({
      id: nextId(ctx.fin, 'ln'),
      itemId: null,
      label: `Late fee · overdue since ${fmtDate(inv.dueOn)}`,
      category: 'Late fee',
      amount,
      optional: false,
      addedOn: isoToday(),
    });
    inv.history.push(historyEntry('Late fee added', `${ctx.actor} · ${naira(amount)}`, 'warning'));
  }
  ctx.log('finance', `Late fees added to ${plural(targets.length, 'invoice')}`, naira(total));
  ctx.refresh();
  return { applied: targets.length, total };
});

/* ---------------- Editing an invoice ---------------- */

const done = (ctx: FinCtx, inv: InvoiceRec) => invoiceDetail(ctx.refresh(), inv);

mock.post('/v1/finance/invoices/:id/lines', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const p = (req.body ?? {}) as { itemId?: string; label?: string; amount?: number };
  if (p.itemId) {
    const item = ctx.fin.items.find((i) => i.id === p.itemId);
    const amount = structureFor(ctx.fin, inv.termId, inv.branchId)?.amounts[inv.level]?.[p.itemId];
    if (!item || !amount)
      throw new MockHttpError(
        422,
        `${item?.name ?? 'That item'} isn’t offered for ${inv.level} this term.`,
      );
    if (inv.lines.some((l) => l.itemId === item.id))
      throw new MockHttpError(422, `${item.name} is already on this invoice.`);
    inv.lines.push({
      id: nextId(ctx.fin, 'ln'),
      itemId: item.id,
      label: item.name,
      category: item.category,
      amount,
      optional: item.type === 'Optional',
      addedOn: isoToday(),
    });
    inv.history.push(historyEntry(`${item.name} added`, `${ctx.actor} · ${naira(amount)}`));
  } else {
    const label = requireText(p.label, 'Describe the charge.');
    const amount = requireMoney(p.amount, 'Enter the amount in naira.');
    inv.lines.push({
      id: nextId(ctx.fin, 'ln'),
      itemId: null,
      label,
      category: 'Adjustment',
      amount,
      optional: false,
      addedOn: isoToday(),
    });
    inv.history.push(historyEntry(`Charge added: ${label}`, `${ctx.actor} · ${naira(amount)}`));
  }
  return done(ctx, inv);
});

mock.delete('/v1/finance/invoices/:id/lines/:lineId', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const line = inv.lines.find((l) => l.id === req.params.lineId);
  if (!line) throw new MockHttpError(404, 'Line not found');
  const reason = (req.query.reason ?? '').trim();
  if (!line.optional && !reason)
    throw new MockHttpError(422, 'Give a reason for removing a compulsory charge.');
  if (inv.lines.length === 1)
    throw new MockHttpError(422, 'An invoice needs at least one charge. Cancel it instead.');
  const before = ctx.ledger.invoice(inv.id);
  inv.lines = inv.lines.filter((l) => l.id !== line.id);
  const over = Math.max(0, before.received - totalOf(inv));
  inv.history.push(
    historyEntry(
      `${line.label} removed`,
      `${ctx.actor} · ${naira(line.amount)}${reason ? ` · ${reason}` : ''}${over ? ` · ${naira(over)} moved to credit` : ''}`,
      'neutral',
    ),
  );
  return done(ctx, inv);
});

mock.post('/v1/finance/invoices/:id/discounts', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const p = (req.body ?? {}) as { discountId?: string; amount?: number; reason?: string };
  const d = ctx.fin.discounts.find((x) => x.id === p.discountId && x.status === 'Active');
  if (!d) throw new MockHttpError(422, 'Choose a discount.');
  if (inv.discounts.some((x) => x.discountId === d.id))
    throw new MockHttpError(422, `${d.name} is already applied.`);
  const custom =
    d.basis === 'Custom' ? requireMoney(p.amount, 'Enter the concession amount.') : undefined;
  const reason = (p.reason ?? '').trim();
  if ((d.basis === 'Custom' || d.basis === 'Scholarship') && !reason)
    throw new MockHttpError(422, 'Give a reason; it is kept with the approval.');
  const amount = discountAmount(ctx.fin, inv, d, custom);
  if (!amount)
    throw new MockHttpError(
      422,
      `This invoice has no ${d.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory'} charges to discount.`,
    );
  if (custom && custom > amount)
    throw new MockHttpError(422, `The most this discount can take off is ${naira(amount)}.`);
  const before = ctx.ledger.invoice(inv.id);
  inv.discounts.push({
    id: nextId(ctx.fin, 'dl'),
    discountId: d.id,
    label: d.name,
    amount,
    by: ctx.actor,
    approvedBy: d.needsApproval ? ctx.actor : null,
    reason,
  });
  const over = Math.max(0, before.received - totalOf(inv));
  inv.history.push(
    historyEntry(
      `${d.name} applied`,
      `${ctx.actor} · −${naira(amount)}${d.needsApproval ? ' · approval recorded' : ''}${over ? ` · ${naira(over)} moved to credit` : ''}`,
      'success',
    ),
  );
  return done(ctx, inv);
});

mock.delete('/v1/finance/invoices/:id/discounts/:discountLineId', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const d = inv.discounts.find((x) => x.id === req.params.discountLineId);
  if (!d) throw new MockHttpError(404, 'Discount not found');
  inv.discounts = inv.discounts.filter((x) => x.id !== d.id);
  inv.history.push(
    historyEntry(
      `${d.label} removed`,
      `${ctx.actor} · ${naira(d.amount)} back on the balance`,
      'neutral',
    ),
  );
  return done(ctx, inv);
});

mock.put('/v1/finance/invoices/:id/plan', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const plan = ctx.fin.plans.find(
    (p) => p.id === (req.body as { planId?: string })?.planId && p.status === 'Active',
  );
  if (!plan) throw new MockHttpError(422, 'Choose a payment plan.');
  inv.planId = plan.id;
  ctx.fin.studentPlans[inv.studentKey] = plan.id;
  inv.history.push(historyEntry(`Payment plan: ${plan.name}`, ctx.actor));
  return done(ctx, inv);
});

mock.post('/v1/finance/invoices/:id/apply-credit', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const amount = requireMoney(
    (req.body as { amount?: number })?.amount,
    'Enter how much credit to apply.',
  );
  const credit = ctx.ledger.credit(inv.studentKey);
  const bal = ctx.ledger.invoice(inv.id).balance;
  if (amount > credit) throw new MockHttpError(422, `Only ${naira(credit)} credit is available.`);
  if (amount > bal) throw new MockHttpError(422, `The balance is only ${naira(bal)}.`);
  ctx.fin.creditUses.push({
    id: nextId(ctx.fin, 'cu'),
    studentKey: inv.studentKey,
    invoiceId: inv.id,
    amount,
    date: isoToday(),
    by: ctx.actor,
  });
  inv.history.push(historyEntry('Credit applied', `${ctx.actor} · ${naira(amount)}`, 'success'));
  return done(ctx, inv);
});

mock.post('/v1/finance/invoices/:id/cancel', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const reason = requireText(
    (req.body as { reason?: string })?.reason,
    'Give a reason for cancelling.',
  );
  const paid = ctx.ledger.invoice(inv.id).paid;
  inv.status = 'Cancelled';
  inv.cancelled = { on: isoToday(), reason, by: ctx.actor };
  inv.history.push(
    historyEntry(
      'Cancelled',
      `${ctx.actor} · ${reason}${paid ? ` · ${naira(paid)} moved to credit` : ''}`,
      'neutral',
    ),
  );
  ctx.log('finance', `Invoice ${inv.no || 'draft'} cancelled`, reason);
  return done(ctx, inv);
});

mock.post('/v1/finance/invoices/:id/remind', (req) => {
  const ctx = finFor(req);
  const inv = live(findInvoice(ctx, req.params.id!));
  const s = ctx.students.get(inv.studentKey);
  if (!s?.payer)
    throw new MockHttpError(
      422,
      `${s?.name ?? 'This student'} has no guardian linked, so there’s nobody to remind.`,
    );
  const st = ctx.ledger.invoice(inv.id);
  if (st.balance <= 0) throw new MockHttpError(422, 'Nothing is owed on this invoice.');
  inv.history.push(
    historyEntry(
      'Reminder sent',
      `${ctx.actor} · ${naira(st.balance)} · SMS and email to ${s.payer}`,
    ),
  );
  ctx.fin.reminders.unshift({ date: isoToday(), count: 1, channel: 'SMS · Email', by: ctx.actor });
  feeReminders(ctx.schoolId, [inv], ctx.actor);
  return { sentTo: s.payer };
});

/** Sends the bank details and transfer reference to the fee payer. */
mock.post('/v1/finance/students/:key/send-details', (req) => {
  const ctx = finFor(req);
  const s = studentOf(ctx, req.params.key!);
  if (!s.payer) throw new MockHttpError(422, `${s.name} has no guardian linked.`);
  const details = payTo(ctx, s, outstandingOf(ctx, s.key));
  if (!details)
    throw new MockHttpError(
      409,
      'Add a bank account shown to parents in Bank & Cash Accounts first.',
    );
  ctx.fin.reminders.unshift({ date: isoToday(), count: 1, channel: 'SMS · Email', by: ctx.actor });
  ctx.log('finance', `Payment details sent to ${s.payer}`, s.name);
  paymentDetailsSent(ctx.schoolId, s.key, ctx.actor);
  return { sentTo: s.payer };
});

/* ---------------- Student accounts ---------------- */

mock.get('/v1/finance/students', (req) => {
  const ctx = finFor(req);
  const q = (req.query.search ?? '').trim().toLowerCase();
  const branchId = branchScope(ctx, req.query.branch);
  const rows: PayerSearchRow[] = allStudents(ctx)
    .filter(
      (s) =>
        (s.active || ctx.fin.invoices.some((i) => i.studentKey === s.key)) &&
        (!branchId || s.branchId === branchId),
    )
    .filter((s) => !q || `${s.name} ${s.admissionNo} ${s.payer ?? ''}`.toLowerCase().includes(q))
    .map((s) => ({
      studentKey: s.key,
      studentId: s.recordId,
      name: s.name,
      admissionNo: s.admissionNo,
      className: classOf(s),
      branch: branchNameOf(ctx, s.branchId),
      payer: s.payer,
      outstanding: outstandingOf(ctx, s.key),
      credit: ctx.ledger.credit(s.key),
      openInvoices: openInvoices(ctx, s.key).length,
    }))
    .sort((a, b) =>
      req.query.owing ? b.outstanding - a.outstanding : a.name.localeCompare(b.name),
    );
  return rows.slice(0, Number(req.query.limit ?? 20));
});

export function studentAccount(ctx: FinCtx, s: FinStudent): StudentAccount {
  const invoices = ctx.fin.invoices
    .filter((i) => i.studentKey === s.key)
    .sort((a, b) => (b.issuedOn ?? b.createdOn).localeCompare(a.issuedOn ?? a.createdOn))
    .map((i) => invoiceRow(ctx, i));
  const payments = ctx.fin.payments
    .filter((p) => p.studentKey === s.key)
    .sort((a, b) => b.date.localeCompare(a.date));
  const refunds = ctx.fin.refunds.filter((x) => x.studentKey === s.key);
  type Line = StudentAccount['statement'][number];
  const lines: Omit<Line, 'balance'>[] = [];
  for (const inv of ctx.fin.invoices.filter(
    (i) => i.studentKey === s.key && i.status !== 'Draft',
  )) {
    const t = ctx.terms.find((x) => x.id === inv.termId);
    lines.push({
      date: inv.issuedOn ?? inv.createdOn,
      ref: inv.no,
      description: `Invoice · ${t?.session} ${t?.name}`,
      debit: totalOf(inv),
      credit: 0,
    });
    if (inv.status === 'Cancelled' && inv.cancelled)
      lines.push({
        date: inv.cancelled.on,
        ref: inv.no,
        description: `Cancelled · ${inv.cancelled.reason}`,
        debit: 0,
        credit: totalOf(inv),
      });
  }
  for (const p of payments.filter((x) => x.status === 'Confirmed'))
    lines.push({
      date: p.date,
      ref: p.no,
      description: `Payment · ${p.method}`,
      debit: 0,
      credit: p.amount,
    });
  for (const rf of refunds.filter((x) => x.status === 'Paid'))
    lines.push({
      date: rf.paidOn!,
      ref: rf.no,
      description: 'Refund paid',
      debit: rf.amount,
      credit: 0,
    });
  lines.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  const statement = lines.map((l) => ({ ...l, balance: (bal += l.debit - l.credit) }));
  const outstanding = outstandingOf(ctx, s.key);
  const open = invoices.filter((i) => i.balance > 0);
  return {
    studentKey: s.key,
    studentId: s.recordId,
    name: s.name,
    admissionNo: s.admissionNo,
    className: classOf(s),
    branch: branchNameOf(ctx, s.branchId),
    branchId: s.branchId,
    payer: s.payer,
    payerPhone: s.payerPhone,
    outstanding,
    overdue: sum(open.filter((i) => i.overdue).map((i) => i.balance)),
    pending: sum(payments.filter((p) => p.status === 'Pending verification').map((p) => p.amount)),
    credit: ctx.ledger.credit(s.key),
    invoices,
    payments: payments.map((p) => paymentRow(ctx, p)),
    refunds: refunds.map((x) => refundRow(ctx, x)),
    statement,
    payTo: outstanding > 0 ? payTo(ctx, s, outstanding) : null,
  };
}

mock.get('/v1/finance/students/:key', (req) => {
  const ctx = finFor(req);
  return studentAccount(ctx, studentOf(ctx, req.params.key!));
});

export const rowsOf = (ctx: FinCtx, invs: InvoiceRec[]): InvoiceRow[] =>
  invs.map((i) => invoiceRow(ctx, i));
export { r as financeRoutes };
