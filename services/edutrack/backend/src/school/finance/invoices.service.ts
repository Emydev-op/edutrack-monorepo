import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { fmtDate } from '../academics/academic-format.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { FinanceCore, type FinLog } from './finance-core.service.js';
import {
  DRAFT_NO,
  type DiscountRec,
  type FeeItemRec,
  type FinStudent,
  type InvoiceRec,
  type TermRef,
} from './finance-data.js';
import {
  addDays,
  classOf,
  dateOnly,
  FIN_ROUTE,
  finConflict,
  finFail,
  kobo,
  LINE_CATEGORY_DB,
  money,
  notFound,
  ordinal,
  plural,
  requireMoney,
  requireText,
  sum,
  type LineCategoryLabel,
  billedTo,
} from './finance-format.js';
import { siblingPositions, totalOf, type InvoiceStatusLabel } from './finance-ledger.js';
import { FinanceNotifyService, type FeeMessage } from './finance-notify.service.js';
import type {
  FinanceNotice,
  FinView,
  InvoiceRow,
  PaymentRow,
  PayToDetails,
} from './finance-view.js';
import type {
  AddLineDto,
  ApplyCreditDto,
  ApplyDiscountDto,
  CancelInvoiceDto,
  ChangePlanDto,
  FinanceStudentsQuery,
  GenerateInvoicesDto,
  InvoiceIdsDto,
  InvoiceListQuery,
  LateFeesDto,
  RemindDto,
} from './dto/invoices.dto.js';

/** What a reminder SMS costs per fee payer, as the mock counts it. */
const SMS_COST = 4;
const STATUSES: InvoiceStatusLabel[] = [
  'Draft',
  'Issued',
  'Partially paid',
  'Paid',
  'Overdue',
  'Cancelled',
];

type Flush = () => Promise<void>;
const NO_FLUSH: Flush = () => Promise.resolve();

/** An invoice worked out from the fee structure, before it is saved. */
interface BuiltInvoice {
  studentKey: string;
  levelId: string;
  level: string;
  armId: string | null;
  branchId: string;
  termId: string;
  lines: {
    itemId: string | null;
    label: string;
    category: LineCategoryLabel;
    amount: number;
    optional: boolean;
  }[];
  discounts: { discountId: string; label: string; amount: number; by: string }[];
  dueOn: string;
  planId: string | null;
}

type Billable = {
  lines: { itemId: string | null; amount: number }[];
  discounts: { amount: number }[];
};

/**
 * Invoices and student accounts (`/v1/finance/invoices`, `/v1/finance/students`), as the School
 * Admin mock's `finance-invoices.ts`. Invoices are generated per term in one action from the
 * published fee structure of each student's class: compulsory items charged that term, optional
 * items the student opted into (carried from their last invoice), then the automatic sibling
 * discount. Issued invoices can be adjusted one by one; balances carry across terms because a
 * student's account is every invoice they have.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly core: FinanceCore,
    private readonly notify: FinanceNotifyService,
  ) {}

  /* ---------------- Shared ---------------- */

  private find(v: FinView, id: string) {
    const inv = v.fin.invoices.find((i) => i.id === id || (i.no && i.no === id));
    if (!inv) throw notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    return inv;
  }

  private live(inv: InvoiceRec) {
    if (inv.status === 'Cancelled')
      throw finConflict('This invoice is cancelled.', 'INVOICE_CANCELLED');
    return inv;
  }

  private item(v: FinView, id: string | null): FeeItemRec | undefined {
    return id ? v.fin.items.find((i) => i.id === id) : undefined;
  }

  /** What a discount takes off: a % or fixed amount of tuition or all compulsory lines. */
  private discountAmount(v: FinView, inv: Billable, d: DiscountRec, custom?: number) {
    const base = sum(
      inv.lines
        .filter((l) => {
          const item = this.item(v, l.itemId);
          return d.appliesTo === 'Tuition only'
            ? item?.category === 'Tuition'
            : !!item && item.type === 'Compulsory';
        })
        .map((l) => l.amount),
    );
    const raw = custom ?? (d.kind === 'Percentage' ? Math.round((base * d.value) / 100) : d.value);
    const total = Math.max(
      0,
      sum(inv.lines.map((l) => l.amount)) - sum(inv.discounts.map((x) => x.amount)),
    );
    return Math.max(0, Math.min(raw, base, total));
  }

  private dueFor(t: TermRef) {
    return t.due ?? addDays(t.start, 14);
  }

  private structureAmounts(v: FinView, termId: string, branchId: string, level: string) {
    return v.fin.structures.find((s) => s.termId === termId && s.branchId === branchId)?.amounts[
      level
    ];
  }

  private hasInvoice(v: FinView, key: string, termId: string) {
    return v.fin.invoices.some(
      (i) => i.studentKey === key && i.termId === termId && i.status !== 'Cancelled',
    );
  }

  /** Students on the term's roll (their enrollment in the term's session is active). */
  private eligible(v: FinView, term: TermRef, branchId: string | null, levels?: string[]) {
    const out: { s: FinStudent; place: NonNullable<ReturnType<FinView['placement']>> }[] = [];
    for (const s of v.students.values()) {
      const place = v.placement(s, term);
      if (!place?.active || !s.active) continue;
      if (branchId && place.branchId !== branchId) continue;
      if (levels?.length && !levels.includes(place.level)) continue;
      out.push({ s, place });
    }
    return out;
  }

  /** Whether a fee item is billed to this student in this term. */
  private chargedIn(v: FinView, item: FeeItemRec, term: TermRef, s: FinStudent) {
    if (item.charged === 'Every term') return true;
    if (item.charged === 'Once a session') return term.index === 0;
    // New students only: in the first term they are billed, in the session they joined.
    return (
      s.firstSessionId === term.sessionId &&
      !v.fin.invoices.some(
        (i) => i.studentKey === s.key && i.status !== 'Cancelled' && i.termId !== term.id,
      )
    );
  }

  /** Optional items the student took last term (still offered and priced this term). */
  private optedIn(v: FinView, s: FinStudent, term: TermRef) {
    const startOf = (id: string) => v.terms.find((t) => t.id === id)?.start ?? '';
    const prev = v.fin.invoices
      .filter(
        (i) => i.studentKey === s.key && i.status !== 'Cancelled' && startOf(i.termId) < term.start,
      )
      .sort((a, b) => startOf(b.termId).localeCompare(startOf(a.termId)))[0];
    return new Set(prev?.lines.filter((l) => l.optional && l.itemId).map((l) => l.itemId!) ?? []);
  }

  private build(
    v: FinView,
    s: FinStudent,
    place: NonNullable<ReturnType<FinView['placement']>>,
    term: TermRef,
    siblings: Map<string, { position: number; eldest: string }>,
  ): BuiltInvoice | null {
    const st = v.fin.structures.find((x) => x.termId === term.id && x.branchId === place.branchId);
    const amounts = st?.amounts[place.level];
    // Only a published structure bills students; drafts are still being reviewed.
    if (!st || st.status !== 'Published' || !amounts) return null;
    const opted = this.optedIn(v, s, term);
    const lines: BuiltInvoice['lines'] = [];
    for (const item of v.fin.items) {
      if (item.status !== 'Active') continue;
      if (item.type === 'Optional' && !opted.has(item.id)) continue;
      // Boarding fees go to boarders only (by gender when the item says so).
      if (!billedTo(item, { gender: s.gender, boarding: place.boarding })) continue;
      if (!this.chargedIn(v, item, term, s)) continue;
      const amount = amounts[item.id];
      if (!amount) continue;
      lines.push({
        itemId: item.id,
        label: item.name,
        category: item.category,
        amount,
        optional: item.type === 'Optional',
      });
    }
    if (!lines.some((l) => !l.optional)) return null;
    const inv: BuiltInvoice = {
      studentKey: s.key,
      levelId: place.levelId,
      level: place.level,
      armId: place.armId,
      branchId: place.branchId,
      termId: term.id,
      lines,
      discounts: [],
      dueOn: this.dueFor(term),
      planId:
        (s.planId && v.fin.plans.some((p) => p.id === s.planId && p.status === 'Active')
          ? s.planId
          : null) ??
        v.fin.plans.find((p) => p.isDefault)?.id ??
        null,
    };
    const sib = v.fin.discounts.find((d) => d.basis === 'Sibling' && d.status === 'Active');
    const pos = siblings.get(s.key);
    if (v.fin.settings.autoSibling && sib && pos && pos.position >= sib.fromChild) {
      const amount = this.discountAmount(v, inv, sib);
      if (amount > 0)
        inv.discounts.push({
          discountId: sib.id,
          label: `${sib.name} · ${ordinal(pos.position)} child`,
          amount,
          by: `Automatic · sibling of ${pos.eldest}`,
        });
    }
    return inv;
  }

  /** Invoice numbers for this many invoices, `INV-2026-0001` onwards. */
  private async numbers(tx: TenantTx, v: FinView, termId: string, count: number) {
    const term = v.terms.find((t) => t.id === termId)!;
    const prefix = v.fin.settings.invoicePrefix;
    const year = term.session.slice(0, 4);
    if (!count) return [];
    const first = await this.core.nextNumber(tx, 'invoice', prefix, year);
    const start = Number(first.slice(`${prefix}-${year}-`.length));
    return Array.from(
      { length: count },
      (_, i) => `${prefix}-${year}-${String(start + i).padStart(4, '0')}`,
    );
  }

  /** Sends the invoices to their fee payers (call inside the transaction, after the writes). */
  private async sendIssued(tx: TenantTx, ids: string[]): Promise<Flush> {
    if (!ids.length) return NO_FLUSH;
    const v = await this.core.load(tx);
    const messages: FeeMessage[] = ids.map((id) => ({
      studentKey: v.fin.invoices.find((i) => i.id === id)!.studentKey,
      vars: this.notify.invoiceVars(v, id),
    }));
    const term = v.terms.find((t) => t.id === v.fin.invoices.find((i) => i.id === ids[0])!.termId);
    const sent = await this.notify.send(
      tx,
      v,
      'invoice.issued',
      `${term ? `${term.session} ${term.name} ` : ''}invoices`,
      messages,
    );
    return sent.flush;
  }

  /* ---------------- List ---------------- */

  async list(q: InvoiceListQuery) {
    const v = await this.core.load();
    const branchId = v.branchScope(q.branch);
    const term = q.term === 'all' ? null : v.termOf(q.term, q.session);
    const scoped = v.fin.invoices.filter(
      (i) => (!term || i.termId === term.id) && (!branchId || i.branchId === branchId),
    );
    const rows = scoped.map((i) => v.invoiceRow(i));
    const counts = { All: rows.length } as Record<InvoiceStatusLabel | 'All', number>;
    for (const s of STATUSES) counts[s] = rows.filter((x) => x.status === s).length;
    const billedRows = rows.filter((x) => x.status !== 'Draft' && x.status !== 'Cancelled');
    const billed = sum(billedRows.map((x) => x.total));
    const collected = sum(billedRows.map((x) => x.paid));
    const search = (q.search ?? '').trim().toLowerCase();
    const filtered = rows
      .filter((x) =>
        !q.status ? true : q.status === 'Open' ? x.balance > 0 : x.status === q.status,
      )
      .filter((x) => !q.level || x.className.startsWith(q.level))
      .filter(
        (x) =>
          !search ||
          `${x.no} ${x.student} ${x.admissionNo} ${x.payer ?? ''} ${x.className}`
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) => a.no.localeCompare(b.no));
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const page = Math.max(1, Number(q.page) || 1);
    const uninvoiced = term
      ? this.eligible(v, term, branchId).filter(({ s }) => !this.hasInvoice(v, s.key, term.id))
          .length
      : 0;
    const lateFeeCandidates = this.lateFeeTargets(v, term, branchId).length;
    const notices: FinanceNotice[] = [];
    if (uninvoiced && term)
      notices.push({
        tone: 'warning',
        title: `${plural(uninvoiced, 'student')} ${uninvoiced === 1 ? 'has' : 'have'} no ${term.name} invoice`,
        description:
          'Usually students admitted after invoices were issued. Generate their invoices from the fee structure.',
        action: {
          label: 'Generate invoices',
          to: { name: FIN_ROUTE.invoiceGenerate, query: { term: term.id } },
        },
      });
    if (counts.Draft)
      notices.push({
        tone: 'info',
        title: `${plural(counts.Draft, 'draft invoice')} not issued`,
        description:
          'Drafts aren’t sent to parents and don’t count as billed until you issue them.',
        action: {
          label: 'Show drafts',
          to: {
            name: FIN_ROUTE.invoices,
            query: { status: 'Draft', ...(term && { term: term.id }) },
          },
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
      levels: [...new Set(scoped.map((i) => i.level))].sort(
        (a, b) => v.levelRank(a) - v.levelRank(b),
      ),
      terms: v.terms
        .filter((t) => v.fin.invoices.some((i) => i.termId === t.id) || t.id === term?.id)
        .map((t) => ({ id: t.id, name: t.name, session: t.session })),
      notices,
      uninvoiced,
      lateFeeCandidates,
    };
  }

  /* ---------------- Detail ---------------- */

  async detail(id: string) {
    const v = await this.core.load();
    return this.detailOf(v, this.find(v, id));
  }

  private async detailOf(v: FinView, inv: InvoiceRec) {
    const row = v.invoiceRow(inv);
    const st = v.ledger.invoice(inv.id);
    const s = v.students.get(inv.studentKey);
    const structure = this.structureAmounts(v, inv.termId, inv.branchId, inv.level) ?? {};
    const allocations = [
      ...v.fin.payments.flatMap((p) =>
        p.allocations
          .filter((a) => a.invoiceId === inv.id)
          .map((a) => ({
            paymentId: p.id,
            receipt: p.no,
            date: p.date,
            method: p.method as string,
            amount: a.amount,
            status: p.status as string,
            recordedBy: p.recordedBy,
          })),
      ),
      ...v.fin.creditUses
        .filter((c) => c.invoiceId === inv.id)
        .map((c) => ({
          paymentId: '',
          receipt: 'Credit',
          date: c.date,
          method: 'Credit on account',
          amount: c.amount,
          status: 'Credit applied',
          recordedBy: c.by,
        })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set(inv.discounts.map((d) => d.discountId));
    const plan = v.fin.plans.find((p) => p.id === inv.planId);
    return {
      ...row,
      level: inv.level,
      arm: inv.arm,
      lines: inv.lines.map((l) => ({ ...l, removable: inv.status !== 'Cancelled' })),
      discounts: inv.discounts,
      subtotal: st.subtotal,
      discountTotal: st.discount,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      installments: st.installments,
      allocations,
      cancelled: inv.cancelled,
      notified: inv.notified,
      credit: v.ledger.credit(inv.studentKey),
      otherOpen: v
        .openInvoices(inv.studentKey)
        .filter((i) => i.id !== inv.id)
        .map((i) => {
          const t = v.terms.find((x) => x.id === i.termId);
          const ist = v.ledger.invoice(i.id);
          return {
            id: i.id,
            no: i.no,
            term: `${t?.session} · ${t?.name}`,
            balance: ist.balance,
            status: ist.status,
          };
        }),
      optionalAvailable: v.fin.items
        .filter(
          (i) =>
            i.status === 'Active' &&
            i.type === 'Optional' &&
            structure[i.id] &&
            !inv.lines.some((l) => l.itemId === i.id),
        )
        .map((i) => ({ itemId: i.id, name: i.name, amount: structure[i.id]! })),
      discountsAvailable: v.fin.discounts
        .filter((d) => d.status === 'Active' && d.basis !== 'Sibling' && !used.has(d.id))
        .map((d) => ({
          id: d.id,
          name: d.name,
          basis: d.basis,
          amount: this.discountAmount(v, inv, d),
          needsApproval: d.needsApproval,
        })),
      plans: v.fin.plans
        .filter((p) => p.status === 'Active')
        .map((p) => ({ id: p.id, name: p.name })),
      payTo: s && st.balance > 0 ? v.payTo(s, v.outstandingOf(s.key)) : null,
      history: await this.core.history('Invoice', inv.id),
      canCancel:
        inv.status === 'Cancelled'
          ? { ok: false, reason: 'Already cancelled.' }
          : {
              ok: true,
              reason:
                st.paid > 0
                  ? `${money(st.paid)} already paid moves to ${s?.name ?? 'the student'}’s credit, to apply elsewhere or refund.`
                  : '',
            },
    };
  }

  /* ---------------- Generate & issue ---------------- */

  private preview(v: FinView, p: GenerateInvoicesDto) {
    const term = v.termOf(p.termId);
    const branchId = v.branchScope(p.branchId);
    const pool = this.eligible(v, term, branchId, p.levels);
    const todo = pool.filter(({ s }) => !this.hasInvoice(v, s.key, term.id));
    // Sibling order among everyone on the term's roll, by the class they are in that session.
    const roll = this.eligible(v, term, null);
    const levelIn = new Map(roll.map((r) => [r.s.key, r.place.level]));
    const siblings = siblingPositions(
      roll.map((r) => r.s),
      (s) => v.levelRank(levelIn.get(s.key) ?? s.level),
    );
    const built: BuiltInvoice[] = [];
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
    for (const { s, place } of todo) {
      const inv = this.build(v, s, place, term, siblings);
      const key = `${place.branchId}|${place.level}`;
      const row = levels.get(key) ?? {
        level: place.level,
        branch: v.branchName(place.branchId),
        students: 0,
        each: 0,
        total: 0,
        missing: false,
      };
      row.students++;
      if (!inv) {
        row.missing = true;
        missing.add(`${place.level} · ${v.branchName(place.branchId)}`);
      } else {
        built.push(inv);
        row.each = Math.max(row.each, sum(inv.lines.map((l) => l.amount)));
        row.total += totalOf(inv);
      }
      levels.set(key, row);
    }
    const due = this.dueFor(term);
    return {
      term,
      built,
      view: {
        term: { id: term.id, name: term.name, session: term.session, start: term.start },
        due: due < v.today ? v.today : due,
        students: pool.length,
        alreadyInvoiced: pool.length - todo.length,
        toCreate: built.length,
        total: sum(built.map((i) => totalOf(i))),
        discounts: sum(built.map((i) => sum(i.discounts.map((d) => d.amount)))),
        levels: [...levels.values()].sort(
          (a, b) => a.branch.localeCompare(b.branch) || v.levelRank(a.level) - v.levelRank(b.level),
        ),
        missingStructures: [...missing],
        noGuardian: built.filter((i) => !v.students.get(i.studentKey)?.payer).length,
      },
    };
  }

  async generatePreview(p: GenerateInvoicesDto) {
    const v = await this.core.load();
    return this.preview(v, p).view;
  }

  async generate(p: GenerateInvoicesDto) {
    const issue = !!p.issue;
    let flush = NO_FLUSH;
    const result = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const pv = this.preview(v, p);
      if (!pv.built.length)
        throw finFail(
          pv.view.missingStructures.length
            ? `Publish fees for ${pv.view.missingStructures.slice(0, 3).join(', ')} first.`
            : 'Every student in this selection already has an invoice for the term.',
          'NOTHING_TO_INVOICE',
        );
      const schoolId = this.core.schoolId();
      const userId = this.core.userId();
      const today = v.today;
      const numbers = issue ? await this.numbers(tx, v, pv.term.id, pv.built.length) : [];
      const rows = pv.built.map((b, i) => {
        const hasPayer = !!v.students.get(b.studentKey)?.payer;
        const dueOn = issue && b.dueOn < today ? addDays(today, 14) : b.dueOn;
        return {
          b,
          hasPayer,
          data: {
            id: randomUUID(),
            schoolId,
            number: issue ? numbers[i]! : `${DRAFT_NO}${randomUUID()}`,
            studentId: b.studentKey,
            termId: b.termId,
            branchId: b.branchId,
            levelId: b.levelId,
            armId: b.armId,
            kind: 'TERM_FEES' as const,
            status: issue ? ('ISSUED' as const) : ('DRAFT' as const),
            issuedOn: issue ? dateOnly(today) : null,
            dueOn: dateOnly(dueOn),
            paymentPlanId: b.planId,
            notifiedAt: issue && hasPayer ? this.core.now() : null,
            createdById: userId,
          },
        };
      });
      await tx.invoice.createMany({ data: rows.map((r) => r.data) });
      await tx.invoiceLine.createMany({
        data: rows.flatMap((r) =>
          r.b.lines.map((l) => ({
            schoolId,
            invoiceId: r.data.id,
            feeItemId: l.itemId,
            label: l.label,
            category: LINE_CATEGORY_DB[l.category],
            amountKobo: kobo(l.amount),
            isOptional: l.optional,
            addedById: userId,
          })),
        ),
      });
      const discounts = rows.flatMap((r) =>
        r.b.discounts.map((d) => ({
          schoolId,
          invoiceId: r.data.id,
          discountId: d.discountId,
          label: d.label,
          amountKobo: kobo(d.amount),
          reason: d.by,
        })),
      );
      if (discounts.length) await tx.invoiceDiscount.createMany({ data: discounts });
      const ids = rows.map((r) => r.data.id);
      await this.core.syncInvoices(tx, ids);
      const logs: FinLog[] = rows.flatMap((r) => [
        {
          entity: 'Invoice',
          entityId: r.data.id,
          action: 'invoice.create',
          title: 'Invoice created from the fee structure',
        },
        ...(issue
          ? [
              {
                entity: 'Invoice',
                entityId: r.data.id,
                action: 'invoice.issue',
                title: r.hasPayer
                  ? 'Issued and sent to the fee payer'
                  : 'Issued · no guardian to notify',
                detail: r.hasPayer ? 'Email and SMS' : null,
              },
            ]
          : []),
      ]);
      await this.core.log(tx, logs);
      if (issue) flush = await this.sendIssued(tx, ids);
      return {
        created: rows.length,
        issued: issue ? rows.length : 0,
        total: pv.view.total,
        notified: issue ? rows.filter((r) => r.hasPayer).length : 0,
      };
    });
    await flush();
    return result;
  }

  async issue(p: InvoiceIdsDto) {
    const ids = p.ids ?? [];
    let flush = NO_FLUSH;
    const result = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const drafts = v.fin.invoices.filter((i) => ids.includes(i.id) && i.status === 'Draft');
      if (!drafts.length) throw finFail('Select draft invoices to issue.', 'NOTHING_TO_ISSUE');
      const today = v.today;
      const now = this.core.now();
      const logs: FinLog[] = [];
      let notified = 0;
      const byTerm = new Map<string, InvoiceRec[]>();
      for (const inv of drafts) byTerm.set(inv.termId, [...(byTerm.get(inv.termId) ?? []), inv]);
      for (const [termId, list] of byTerm) {
        const numbers = await this.numbers(tx, v, termId, list.length);
        for (const [i, inv] of list.entries()) {
          const hasPayer = !!v.students.get(inv.studentKey)?.payer;
          if (hasPayer) notified++;
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              number: numbers[i]!,
              status: 'ISSUED',
              issuedOn: dateOnly(today),
              ...(inv.dueOn < today && { dueOn: dateOnly(addDays(today, 14)) }),
              notifiedAt: hasPayer ? now : null,
            },
          });
          logs.push({
            entity: 'Invoice',
            entityId: inv.id,
            action: 'invoice.issue',
            title: hasPayer ? 'Issued and sent to the fee payer' : 'Issued · no guardian to notify',
            detail: hasPayer ? 'Email and SMS' : null,
          });
        }
      }
      const issuedIds = drafts.map((i) => i.id);
      await this.core.syncInvoices(tx, issuedIds);
      await this.core.log(tx, logs);
      flush = await this.sendIssued(tx, issuedIds);
      return { issued: drafts.length, notified };
    });
    await flush();
    return result;
  }

  /* ---------------- Reminders & late fees ---------------- */

  async remind(p: RemindDto) {
    const sendIt = async (tx?: TenantTx) => {
      const v = await this.core.load(tx);
      const branchId = v.branchScope(p.branch);
      const targets = p.ids?.length
        ? v.fin.invoices.filter((i) => p.ids!.includes(i.id))
        : v.fin.invoices.filter(
            (i) =>
              (!p.termId || i.termId === p.termId) &&
              (!branchId || i.branchId === branchId) &&
              v.ledger.invoice(i.id).overdue,
          );
      const open = targets.filter(
        (i) => i.status === 'Issued' && v.ledger.invoice(i.id).balance > 0,
      );
      const withPayer = open.filter((i) => v.students.get(i.studentKey)?.payerGuardianId);
      const payers = new Set(withPayer.map((i) => v.students.get(i.studentKey)!.payerGuardianId));
      const result = {
        invoices: open.length,
        recipients: payers.size,
        skipped: open.length - withPayer.length,
        cost: payers.size * SMS_COST,
        total: sum(open.map((i) => v.ledger.invoice(i.id).balance)),
      };
      return { v, withPayer, result };
    };
    if (p.preview) return (await sendIt()).result;
    let flush = NO_FLUSH;
    const result = await this.core.write(async (tx) => {
      const { v, withPayer, result } = await sendIt(tx);
      if (!withPayer.length)
        throw finFail(
          'None of the selected invoices has a balance and a fee payer to remind.',
          'NOTHING_TO_REMIND',
        );
      flush = await this.sendReminders(tx, v, withPayer);
      return result;
    });
    await flush();
    return result;
  }

  /** Logs and sends reminders: "Overdue fee" for overdue invoices, "Fee reminder" for the rest. */
  private async sendReminders(tx: TenantTx, v: FinView, invoices: InvoiceRec[]): Promise<Flush> {
    await this.core.log(
      tx,
      invoices.map((inv) => {
        const st = v.ledger.invoice(inv.id);
        const payer = v.students.get(inv.studentKey)?.payer;
        return {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.remind',
          title: st.overdue ? 'Overdue reminder sent' : 'Reminder sent',
          detail: `${money(st.balance)} · SMS and email${invoices.length === 1 && payer ? ` to ${payer}` : ''}`,
          tone: st.overdue ? 'warning' : 'info',
        };
      }),
    );
    const flushes: Flush[] = [];
    for (const overdue of [true, false]) {
      const list = invoices.filter((i) => v.ledger.invoice(i.id).overdue === overdue);
      if (!list.length) continue;
      const sent = await this.notify.send(
        tx,
        v,
        overdue ? 'fee.overdue' : 'fee.reminder',
        overdue ? 'Overdue fees' : 'Fee reminder',
        list.map((i) => ({ studentKey: i.studentKey, vars: this.notify.invoiceVars(v, i.id) })),
      );
      flushes.push(sent.flush);
    }
    return async () => {
      for (const f of flushes) await f();
    };
  }

  private lateFeeTargets(v: FinView, term: TermRef | null, branchId: string | null) {
    if (v.fin.settings.lateFee.kind === 'None') return [];
    return v.fin.invoices.filter(
      (i) =>
        (!term || i.termId === term.id) &&
        (!branchId || i.branchId === branchId) &&
        i.status === 'Issued' &&
        v.ledger.invoice(i.id).overdue &&
        !i.lines.some((l) => l.category === 'Late fee'),
    );
  }

  async lateFees(p: LateFeesDto) {
    return this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const fee = v.fin.settings.lateFee;
      if (fee.kind === 'None')
        throw finConflict('Set a late fee in Fees › Billing settings first.', 'NO_LATE_FEE');
      const term = p.termId ? v.termOf(p.termId) : null;
      const targets = this.lateFeeTargets(v, term, v.branchScope(p.branch)).filter(
        (i) => !p.ids?.length || p.ids.includes(i.id),
      );
      if (!targets.length)
        throw finFail('No overdue invoices are waiting for a late fee.', 'NOTHING_OVERDUE');
      const schoolId = this.core.schoolId();
      let total = 0;
      const lines = targets.map((inv) => {
        const bal = v.ledger.invoice(inv.id).balance;
        const amount =
          fee.kind === 'Fixed amount' ? fee.value : Math.round((bal * fee.value) / 100 / 100) * 100;
        total += amount;
        return {
          inv,
          amount,
          data: {
            schoolId,
            invoiceId: inv.id,
            feeItemId: null,
            label: `Late fee · overdue since ${fmtDate(inv.dueOn)}`,
            category: 'LATE_FEE' as const,
            amountKobo: kobo(amount),
            isOptional: false,
            addedById: this.core.userId(),
          },
        };
      });
      await tx.invoiceLine.createMany({ data: lines.map((l) => l.data) });
      await this.core.syncInvoices(
        tx,
        targets.map((i) => i.id),
      );
      await this.core.log(
        tx,
        lines.map((l) => ({
          entity: 'Invoice',
          entityId: l.inv.id,
          action: 'invoice.late-fee',
          title: 'Late fee added',
          detail: money(l.amount),
          tone: 'warning' as const,
        })),
      );
      return { applied: targets.length, total };
    });
  }

  /* ---------------- Editing an invoice ---------------- */

  /** Runs an edit on one live invoice and answers with its detail. */
  private async edit(id: string, fn: (tx: TenantTx, v: FinView, inv: InvoiceRec) => Promise<void>) {
    const invoiceId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const inv = this.live(this.find(v, id));
      await fn(tx, v, inv);
      await this.core.syncInvoices(tx, [inv.id]);
      return inv.id;
    });
    return this.detail(invoiceId);
  }

  addLine(id: string, p: AddLineDto) {
    return this.edit(id, async (tx, v, inv) => {
      const schoolId = this.core.schoolId();
      if (p.itemId) {
        const item = this.item(v, p.itemId);
        const amount = item
          ? this.structureAmounts(v, inv.termId, inv.branchId, inv.level)?.[item.id]
          : null;
        if (!item || !amount)
          throw finFail(
            `${item?.name ?? 'That item'} isn’t offered for ${inv.level} this term.`,
            'ITEM_NOT_OFFERED',
          );
        if (inv.lines.some((l) => l.itemId === item.id))
          throw finFail(`${item.name} is already on this invoice.`, 'ITEM_ON_INVOICE');
        await tx.invoiceLine.create({
          data: {
            schoolId,
            invoiceId: inv.id,
            feeItemId: item.id,
            label: item.name,
            category: LINE_CATEGORY_DB[item.category],
            amountKobo: kobo(amount),
            isOptional: item.type === 'Optional',
            addedById: this.core.userId(),
          },
        });
        await this.core.log(tx, [
          {
            entity: 'Invoice',
            entityId: inv.id,
            action: 'invoice.line-add',
            title: `${item.name} added`,
            detail: money(amount),
          },
        ]);
        return;
      }
      const label = requireText(p.label, 'Describe the charge.');
      const amount = requireMoney(p.amount, 'Enter the amount in naira.');
      await tx.invoiceLine.create({
        data: {
          schoolId,
          invoiceId: inv.id,
          feeItemId: null,
          label,
          category: 'ADJUSTMENT',
          amountKobo: kobo(amount),
          isOptional: false,
          addedById: this.core.userId(),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.line-add',
          title: `Charge added: ${label}`,
          detail: money(amount),
        },
      ]);
    });
  }

  removeLine(id: string, lineId: string, reasonRaw?: string) {
    return this.edit(id, async (tx, v, inv) => {
      const line = inv.lines.find((l) => l.id === lineId);
      if (!line) throw notFound('Line not found', 'LINE_NOT_FOUND');
      const reason = (reasonRaw ?? '').trim();
      if (!line.optional && !reason)
        throw finFail('Give a reason for removing a compulsory charge.', 'VALIDATION');
      if (inv.lines.length === 1)
        throw finFail('An invoice needs at least one charge. Cancel it instead.', 'LAST_LINE');
      const before = v.ledger.invoice(inv.id);
      const after = totalOf({
        lines: inv.lines.filter((l) => l.id !== line.id),
        discounts: inv.discounts,
      });
      const over = Math.max(0, before.received - after);
      await tx.invoiceLine.delete({ where: { id: line.id } });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.line-remove',
          title: `${line.label} removed`,
          detail: `${money(line.amount)}${reason ? ` · ${reason}` : ''}${over ? ` · ${money(over)} moved to credit` : ''}`,
          tone: 'neutral',
        },
      ]);
    });
  }

  applyDiscount(id: string, p: ApplyDiscountDto) {
    return this.edit(id, async (tx, v, inv) => {
      const d = v.fin.discounts.find((x) => x.id === p.discountId && x.status === 'Active');
      if (!d) throw finFail('Choose a discount.', 'VALIDATION');
      if (inv.discounts.some((x) => x.discountId === d.id))
        throw finFail(`${d.name} is already applied.`, 'DISCOUNT_APPLIED');
      const custom =
        d.basis === 'Custom' ? requireMoney(p.amount, 'Enter the concession amount.') : undefined;
      const reason = (p.reason ?? '').trim();
      if ((d.basis === 'Custom' || d.basis === 'Scholarship') && !reason)
        throw finFail('Give a reason; it is kept with the approval.', 'VALIDATION');
      const amount = this.discountAmount(v, inv, d, custom);
      if (!amount)
        throw finFail(
          `This invoice has no ${d.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory'} charges to discount.`,
          'NOTHING_TO_DISCOUNT',
        );
      if (custom && custom > amount)
        throw finFail(`The most this discount can take off is ${money(amount)}.`, 'VALIDATION');
      const before = v.ledger.invoice(inv.id);
      const userId = this.core.userId();
      await tx.invoiceDiscount.create({
        data: {
          schoolId: this.core.schoolId(),
          invoiceId: inv.id,
          discountId: d.id,
          label: d.name,
          amountKobo: kobo(amount),
          appliedById: userId,
          approvedById: d.needsApproval ? userId : null,
          approvedAt: d.needsApproval ? this.core.now() : null,
          reason,
        },
      });
      const over = Math.max(0, before.received - Math.max(0, before.total - amount));
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.discount-add',
          title: `${d.name} applied`,
          detail: `−${money(amount)}${d.needsApproval ? ' · approval recorded' : ''}${over ? ` · ${money(over)} moved to credit` : ''}`,
          tone: 'success',
        },
      ]);
    });
  }

  removeDiscount(id: string, lineId: string) {
    return this.edit(id, async (tx, _v, inv) => {
      const d = inv.discounts.find((x) => x.id === lineId);
      if (!d) throw notFound('Discount not found', 'DISCOUNT_NOT_FOUND');
      await tx.invoiceDiscount.delete({ where: { id: d.id } });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.discount-remove',
          title: `${d.label} removed`,
          detail: `${money(d.amount)} back on the balance`,
          tone: 'neutral',
        },
      ]);
    });
  }

  changePlan(id: string, p: ChangePlanDto) {
    return this.edit(id, async (tx, v, inv) => {
      const plan = v.fin.plans.find((x) => x.id === p.planId && x.status === 'Active');
      if (!plan) throw finFail('Choose a payment plan.', 'VALIDATION');
      await tx.invoice.update({ where: { id: inv.id }, data: { paymentPlanId: plan.id } });
      await tx.student.update({
        where: { id: inv.studentKey },
        data: { paymentPlanId: plan.id },
      });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.plan',
          title: `Payment plan: ${plan.name}`,
        },
      ]);
    });
  }

  applyCredit(id: string, p: ApplyCreditDto) {
    return this.edit(id, async (tx, v, inv) => {
      const amount = requireMoney(p.amount, 'Enter how much credit to apply.');
      const credit = v.ledger.credit(inv.studentKey);
      const bal = v.ledger.invoice(inv.id).balance;
      if (amount > credit)
        throw finFail(`Only ${money(credit)} credit is available.`, 'NOT_ENOUGH_CREDIT');
      if (amount > bal) throw finFail(`The balance is only ${money(bal)}.`, 'OVER_BALANCE');
      await tx.creditApplication.create({
        data: {
          schoolId: this.core.schoolId(),
          studentId: inv.studentKey,
          invoiceId: inv.id,
          amountKobo: kobo(amount),
          appliedOn: dateOnly(v.today),
          appliedById: this.core.userId(),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.credit',
          title: 'Credit applied',
          detail: money(amount),
          tone: 'success',
        },
      ]);
    });
  }

  cancel(id: string, p: CancelInvoiceDto) {
    return this.edit(id, async (tx, v, inv) => {
      const reason = requireText(p.reason, 'Give a reason for cancelling.');
      const paid = v.ledger.invoice(inv.id).paid;
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: this.core.now(),
          cancelledById: this.core.userId(),
          cancelReason: reason,
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Invoice',
          entityId: inv.id,
          action: 'invoice.cancel',
          title: 'Cancelled',
          detail: `${reason}${paid ? ` · ${money(paid)} moved to credit` : ''}`,
          tone: 'neutral',
        },
      ]);
    });
  }

  async remindOne(id: string) {
    let flush = NO_FLUSH;
    const result = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const inv = this.live(this.find(v, id));
      const s = v.students.get(inv.studentKey);
      if (!s?.payer)
        throw finFail(
          `${s?.name ?? 'This student'} has no guardian linked, so there’s nobody to remind.`,
          'NO_FEE_PAYER',
        );
      if (v.ledger.invoice(inv.id).balance <= 0)
        throw finFail('Nothing is owed on this invoice.', 'NOTHING_OWED');
      flush = await this.sendReminders(tx, v, [inv]);
      return { sentTo: s.payer };
    });
    await flush();
    return result;
  }

  /** Sends the bank details and transfer reference to the fee payer. */
  async sendDetails(key: string) {
    let flush = NO_FLUSH;
    const result = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const s = v.studentOf(key);
      if (!s.payer) throw finFail(`${s.name} has no guardian linked.`, 'NO_FEE_PAYER');
      const outstanding = v.outstandingOf(s.key);
      const details = v.payTo(s, outstanding);
      if (!details)
        throw finConflict(
          'Add a bank account shown to parents in Bank & Cash Accounts first.',
          'NO_PARENT_ACCOUNT',
        );
      await this.core.log(tx, [
        {
          entity: 'Student',
          entityId: s.key,
          action: 'finance.payment-details',
          title: `Payment details sent to ${s.payer}`,
          detail: s.name,
        },
      ]);
      const sent = await this.notify.send(tx, v, 'payment.details', 'Payment details', [
        {
          studentKey: s.key,
          vars: { balance: money(outstanding), ...this.notify.payVars(v, s, outstanding) },
        },
      ]);
      flush = sent.flush;
      return { sentTo: s.payer };
    });
    await flush();
    return result;
  }

  /* ---------------- Student accounts ---------------- */

  async students(q: FinanceStudentsQuery) {
    const v = await this.core.load();
    const search = (q.search ?? '').trim().toLowerCase();
    const branchId = v.branchScope(q.branch);
    const owing = q.owing === 'true' || q.owing === '1';
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
    return [...v.students.values()]
      .filter(
        (s) =>
          (s.active || v.fin.invoices.some((i) => i.studentKey === s.key)) &&
          (!branchId || s.branchId === branchId),
      )
      .filter(
        (s) =>
          !search || `${s.name} ${s.admissionNo} ${s.payer ?? ''}`.toLowerCase().includes(search),
      )
      .map((s) => ({
        studentKey: s.key,
        studentId: s.recordId,
        name: s.name,
        admissionNo: s.admissionNo,
        className: classOf(s),
        branch: v.branchName(s.branchId),
        payer: s.payer,
        outstanding: v.outstandingOf(s.key),
        credit: v.ledger.credit(s.key),
        openInvoices: v.openInvoices(s.key).length,
      }))
      .sort((a, b) => (owing ? b.outstanding - a.outstanding : a.name.localeCompare(b.name)))
      .slice(0, limit);
  }

  async account(key: string) {
    const v = await this.core.load();
    return this.accountOf(v, v.studentOf(key));
  }

  accountOf(v: FinView, s: FinStudent) {
    const mine = v.fin.invoices.filter((i) => i.studentKey === s.key);
    const invoices: InvoiceRow[] = [...mine]
      .sort((a, b) => (b.issuedOn ?? b.createdOn).localeCompare(a.issuedOn ?? a.createdOn))
      .map((i) => v.invoiceRow(i));
    const payments = v.fin.payments
      .filter((p) => p.studentKey === s.key)
      .sort((a, b) => b.date.localeCompare(a.date));
    const refunds = v.fin.refunds.filter((x) => x.studentKey === s.key);
    type Line = { date: string; ref: string; description: string; debit: number; credit: number };
    const lines: Line[] = [];
    for (const inv of mine.filter((i) => i.status !== 'Draft')) {
      const t = v.terms.find((x) => x.id === inv.termId);
      const total = v.ledger.invoice(inv.id).total;
      lines.push({
        date: inv.issuedOn ?? inv.createdOn,
        ref: inv.no,
        description: `Invoice · ${t?.session} ${t?.name}`,
        debit: total,
        credit: 0,
      });
      if (inv.status === 'Cancelled' && inv.cancelled)
        lines.push({
          date: inv.cancelled.on,
          ref: inv.no,
          description: `Cancelled · ${inv.cancelled.reason}`,
          debit: 0,
          credit: total,
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
    for (const rf of refunds.filter((x) => x.status === 'Paid' && x.paidOn))
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
    const outstanding = v.outstandingOf(s.key);
    const open = invoices.filter((i) => i.balance > 0);
    const paymentRows: PaymentRow[] = payments.map((p) => v.paymentRow(p));
    const payTo: PayToDetails | null = outstanding > 0 ? v.payTo(s, outstanding) : null;
    return {
      studentKey: s.key,
      studentId: s.recordId,
      name: s.name,
      admissionNo: s.admissionNo,
      className: classOf(s),
      branch: v.branchName(s.branchId),
      branchId: s.branchId,
      payer: s.payer,
      payerPhone: s.payerPhone,
      outstanding,
      overdue: sum(open.filter((i) => i.overdue).map((i) => i.balance)),
      pending: sum(
        payments.filter((p) => p.status === 'Pending verification').map((p) => p.amount),
      ),
      credit: v.ledger.credit(s.key),
      invoices,
      payments: paymentRows,
      refunds: refunds.map((x) => v.refundRow(x)),
      statement,
      payTo,
    };
  }
}
