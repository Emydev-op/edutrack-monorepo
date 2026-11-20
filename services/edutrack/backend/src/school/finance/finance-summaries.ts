import { randomUUID } from 'node:crypto';
import type { TenantTx } from '../shared/tenant-tx.js';
import { DRAFT_NO, loadFinance, type FeeItemRec, type TermRef } from './finance-data.js';
import {
  LINE_CATEGORY_DB,
  addDays,
  dateOnly,
  kobo,
  millions,
  money,
  ordinal,
  sum,
} from './finance-format.js';
import { siblingPositions } from './finance-ledger.js';
import { FinView, type TimelineEntry } from './finance-view.js';

/**
 * Finance as other School Admin screens show it: the student page's Finance tab, the admission
 * wizard's fee lines and first invoice, a branch's figures and the Setup Center's Fees step.
 * Everything comes from the same snapshot and ledger as Finance itself.
 */

/** The school's finance for a read outside Finance (any tenant client or transaction). */
export async function financeView(db: TenantTx, schoolId: string, now: Date) {
  return new FinView(await loadFinance(db, schoolId, now), '');
}

/** Billed / collected / outstanding for one term (and branch), from issued invoices. */
export function termFigures(v: FinView, termId: string, branchId: string | null) {
  const invs = v.fin.invoices.filter(
    (i) => i.termId === termId && (!branchId || i.branchId === branchId) && i.status === 'Issued',
  );
  const states = invs.map((inv) => ({ inv, st: v.ledger.invoice(inv.id) }));
  const billed = sum(states.map((x) => x.st.total));
  const collected = sum(states.map((x) => x.st.paid));
  const owing = states.filter((x) => x.st.balance > 0);
  return {
    invoices: invs.length,
    billed,
    collected,
    outstanding: billed - collected,
    owingStudents: new Set(owing.map((x) => x.inv.studentKey)).size,
    overdue: sum(owing.filter((x) => x.st.overdue).map((x) => x.st.balance)),
    overdueCount: owing.filter((x) => x.st.overdue).length,
    rate: billed ? Math.round((collected / billed) * 100) : 0,
    states,
  };
}

/* ---------------- Student page ---------------- */

/** A student's invoices (newest first), payment history and credit on account. */
export function studentFinance(v: FinView, studentId: string) {
  const termStart = (id: string) => v.terms.find((t) => t.id === id)?.start ?? '';
  const invoices = v.fin.invoices
    .filter((i) => i.studentKey === studentId && i.status !== 'Cancelled')
    .sort(
      (a, b) =>
        termStart(b.termId).localeCompare(termStart(a.termId)) ||
        (b.issuedOn ?? b.createdOn).localeCompare(a.issuedOn ?? a.createdOn),
    )
    .map((i) => {
      const row = v.invoiceRow(i);
      return {
        id: i.id,
        number: row.no,
        period: `${row.session} · ${row.term}`,
        total: row.total,
        paid: row.paid,
        pending: row.pending,
        balance: row.balance,
        status: row.status,
      };
    });
  const payments: TimelineEntry[] = v.fin.payments
    .filter((p) => p.studentKey === studentId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
    .map((p) => ({
      id: p.id,
      title: `${money(p.amount)} · ${p.method} · ${p.no}`,
      detail: `${
        p.allocations
          .map((a) => `${v.fin.invoices.find((i) => i.id === a.invoiceId)?.no} ${money(a.amount)}`)
          .join(' + ') || 'Credit on account'
      } · ${p.status}`,
      when: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      tone: p.status === 'Confirmed' ? 'success' : p.status === 'Rejected' ? 'error' : 'warning',
    }));
  return {
    invoices,
    payments,
    financeKey: studentId,
    credit: v.ledger.credit(studentId),
  };
}

/* ---------------- Admissions ---------------- */

/** Whether a compulsory item is billed this term for a returning (false) or new (true) student. */
function chargedNow(item: FeeItemRec, term: TermRef, isNew: boolean) {
  if (item.status !== 'Active' || item.type !== 'Compulsory') return false;
  if (item.charged === 'Every term') return true;
  if (item.charged === 'Once a session') return term.index === 0;
  return isNew;
}

/** What a discount takes off: a percentage or fixed amount of tuition or all compulsory lines. */
function discountOff(
  v: FinView,
  lines: { itemId: string | null; amount: number }[],
  d: { kind: string; value: number; appliesTo: string },
) {
  const base = sum(
    lines
      .filter((l) => {
        const item = v.fin.items.find((i) => i.id === l.itemId);
        return d.appliesTo === 'Tuition only'
          ? item?.category === 'Tuition'
          : !!item && item.type === 'Compulsory';
      })
      .map((l) => l.amount),
  );
  const raw = d.kind === 'Percentage' ? Math.round((base * d.value) / 100) : d.value;
  return Math.max(0, Math.min(raw, base));
}

/**
 * The admission wizard's fees, per "branch|level", from the current term's published structures:
 * this term's compulsory items, the one-time items for new students and the sibling discount.
 */
export function admissionFees(v: FinView) {
  const term = v.currentTerm();
  const feeLines: Record<
    string,
    { items: [string, number][]; once: [string, number][]; sibling: number }
  > = {};
  if (!term) return { feeLines, feesReady: false, admissionFee: 0, siblingDiscount: 0 };
  const sib = v.fin.discounts.find((d) => d.basis === 'Sibling' && d.status === 'Active');
  for (const st of v.fin.structures.filter(
    (x) => x.termId === term.id && x.status === 'Published',
  )) {
    const branch = v.branchName(st.branchId);
    for (const [level, amounts] of Object.entries(st.amounts)) {
      const pick = (once: boolean) =>
        v.fin.items
          .filter((i) =>
            once
              ? chargedNow(i, term, true) && !chargedNow(i, term, false)
              : chargedNow(i, term, false),
          )
          .filter((i) => amounts[i.id])
          .map((i): [string, number] => [`${i.name}${once ? ' (one-time)' : ''}`, amounts[i.id]!]);
      const lines = v.fin.items
        .filter((i) => amounts[i.id])
        .map((i) => ({ itemId: i.id, amount: amounts[i.id]! }));
      const items = pick(false);
      if (!items.length) continue;
      feeLines[`${branch}|${level}`] = {
        items,
        once: pick(true),
        sibling: sib ? discountOff(v, lines, sib) : 0,
      };
    }
  }
  const all = Object.values(feeLines);
  return {
    feeLines,
    feesReady: all.length > 0,
    admissionFee: Math.max(0, ...all.map((f) => sum(f.once.map(([, n]) => n)))),
    siblingDiscount: Math.max(0, ...all.map((f) => f.sibling)),
  };
}

/**
 * The newly admitted student's first invoice, as a draft for Finance to review and issue: this
 * term's compulsory items and the new-student items from the published structure, and the
 * sibling discount when asked for and the fee payer has an elder child here. Null when no
 * structure is published for the class (Finance bills them once one is).
 */
export async function draftAdmissionInvoice(
  tx: TenantTx,
  schoolId: string,
  now: Date,
  o: { studentId: string; sibling: boolean; createdById: string | null },
) {
  const v = await financeView(tx, schoolId, now);
  const s = v.students.get(o.studentId);
  const term = v.currentTerm();
  if (!s || !term) return null;
  const place = v.placement(s, term);
  if (!place) return null;
  const st = v.fin.structures.find(
    (x) => x.termId === term.id && x.branchId === place.branchId && x.status === 'Published',
  );
  const amounts = st?.amounts[place.level];
  if (!amounts) return null;
  const lines = v.fin.items
    .filter((i) => chargedNow(i, term, true) && amounts[i.id])
    .map((i) => ({ itemId: i.id, label: i.name, category: i.category, amount: amounts[i.id]! }));
  if (!lines.length) return null;
  const sib = v.fin.discounts.find((d) => d.basis === 'Sibling' && d.status === 'Active');
  const pos = siblingPositions(
    [...v.students.values()].filter((x) => x.active),
    (x) => v.levelRank(x.level),
  ).get(s.key);
  const discount =
    o.sibling && sib && pos && pos.position >= sib.fromChild
      ? {
          discountId: sib.id,
          label: `${sib.name} · ${ordinal(pos.position)} child`,
          amount: discountOff(v, lines, sib),
          reason: `Automatic · sibling of ${pos.eldest}`,
        }
      : null;
  const subtotal = sum(lines.map((l) => l.amount));
  const off = discount?.amount ?? 0;
  const total = Math.max(0, subtotal - off);
  const due = term.due ?? addDays(term.start, 14);
  const invoice = await tx.invoice.create({
    data: {
      schoolId,
      number: `${DRAFT_NO}${randomUUID()}`,
      studentId: s.key,
      termId: term.id,
      branchId: place.branchId,
      levelId: place.levelId,
      armId: place.armId,
      status: 'DRAFT',
      subtotalKobo: kobo(subtotal),
      discountKobo: kobo(off),
      totalKobo: kobo(total),
      dueOn: dateOnly(due < v.today ? addDays(v.today, 14) : due),
      paymentPlanId: v.fin.plans.find((p) => p.isDefault)?.id ?? null,
      createdById: o.createdById,
    },
    select: { id: true },
  });
  await tx.invoiceLine.createMany({
    data: lines.map((l) => ({
      schoolId,
      invoiceId: invoice.id,
      feeItemId: l.itemId,
      label: l.label,
      category: LINE_CATEGORY_DB[l.category],
      amountKobo: kobo(l.amount),
    })),
  });
  if (discount && discount.amount > 0)
    await tx.invoiceDiscount.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        discountId: discount.discountId,
        label: discount.label,
        amountKobo: kobo(discount.amount),
        reason: discount.reason,
      },
    });
  return { invoiceId: invoice.id, total };
}

/* ---------------- Branches ---------------- */

/** A branch's figures for the current term; null until anything is billed there. */
export function branchFinance(v: FinView, branchId: string) {
  const term = v.currentTerm();
  if (!term) return null;
  const f = termFigures(v, term.id, branchId);
  if (!f.invoices) return null;
  const from = addDays(term.start, -30);
  const expenses = sum(
    v.fin.expenses
      .filter(
        (e) =>
          e.status === 'Paid' &&
          e.branchId === branchId &&
          !!e.paidOn &&
          e.paidOn >= from &&
          e.paidOn <= term.end,
      )
      .map((e) => e.amount),
  );
  return {
    term: `${term.name} ${term.session}`,
    billed: millions(f.billed),
    collected: `${millions(f.collected)} · ${f.rate}%`,
    outstanding: `${millions(f.outstanding)} · ${f.owingStudents.toLocaleString('en-NG')} students`,
    expenses: millions(expenses),
  };
}

/* ---------------- Setup Center ---------------- */

/** Where the current term's fee structures stand, for the Setup Center's Fees step. */
export function feesProgress(v: FinView) {
  const term = v.currentTerm();
  const branches = v.activeBranches().filter((b) => v.branchLevels(b.id).length);
  if (!term) return { term: null, published: 0, branches: branches.length };
  const published = branches.filter((b) =>
    v.fin.structures.some(
      (x) => x.termId === term.id && x.branchId === b.id && x.status === 'Published',
    ),
  ).length;
  return { term, published, branches: branches.length };
}
