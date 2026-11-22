import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { FinanceCore } from '../finance/finance-core.service.js';
import type { InvoiceRec } from '../finance/finance-data.js';
import { dateOnly, kobo, money, shortDate, sum } from '../finance/finance-format.js';
import { financeView } from '../finance/finance-summaries.js';
import type { FinView } from '../finance/finance-view.js';
import { documentSchool, paymentReceipt } from '../finance/receipts.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import type { FeeClaimDto } from './dto/parent.dto.js';
import { guardianDisplay, ParentScopeService, type ChildScope } from './parent-scope.service.js';

export type PayOptionKey = 'all' | 'overdue' | 'current' | 'previous';

export interface PayOption {
  key: PayOptionKey;
  label: string;
  detail: string;
  amount: number;
  /** Where the money goes: invoice id → naira, oldest first. */
  allocations: { invoiceId: string; amount: number }[];
}

/** What a parent can still claim on an invoice: its balance less transfers being verified. */
const unclaimed = (v: FinView, id: string) => {
  const st = v.ledger.invoice(id);
  return Math.max(0, st.balance - st.pending);
};

/** Proof of a transfer: a photo, screenshot or PDF of the receipt. */
const PROOF_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

/**
 * Parent Portal › Fees: a child's invoices (this term's with its installments, and anything
 * still owed from earlier terms), payments and receipts with their status, and where to pay.
 * Parents pay by bank transfer only and then tell the school ("I've paid"): the claim, with
 * proof, waits in Finance › Payments for the bursar to verify against the statement. Only
 * confirmed payments reduce the balance.
 *
 * Guardians who don't pay this child's fees see them read-only (no Pay, no claim). A child who
 * has left keeps their old balances payable.
 */
@Injectable()
export class ParentFeesService {
  constructor(
    private readonly scope: ParentScopeService,
    private readonly finance: FinanceCore,
  ) {}

  private load(auth: AuthUserContext) {
    return financeView(this.scope.db as unknown as TenantTx, auth.schoolId!, this.scope.now());
  }

  /** Live invoices of a student (issued, not cancelled or draft), oldest term first. */
  private invoicesOf(v: FinView, studentId: string): InvoiceRec[] {
    const start = (termId: string) => v.terms.find((t) => t.id === termId)?.start ?? '';
    return v.fin.invoices
      .filter((i) => i.studentKey === studentId && i.status === 'Issued')
      .sort(
        (a, b) =>
          start(a.termId).localeCompare(start(b.termId)) ||
          (a.issuedOn ?? '').localeCompare(b.issuedOn ?? ''),
      );
  }

  /** The child's term-fees invoice for the current term, if issued. */
  private currentInvoice(v: FinView, invoices: InvoiceRec[]) {
    const termId = v.fin.currentTermId;
    return invoices.find((i) => i.termId === termId) ?? null;
  }

  private period(v: FinView, inv: InvoiceRec) {
    const t = v.terms.find((x) => x.id === inv.termId);
    return t ? `${t.name} · ${t.session}` : '';
  }

  private invoiceView(v: FinView, inv: InvoiceRec, current: boolean) {
    const st = v.ledger.invoice(inv.id);
    return {
      id: inv.id,
      number: inv.no,
      period: this.period(v, inv),
      current,
      total: st.total,
      paid: st.paid,
      pending: st.pending,
      balance: st.balance,
      status: st.status,
      overdue: st.overdue,
      dueOn: inv.dueOn,
      dueNote: st.dueNote,
      lines: inv.lines.map((l) => ({ label: l.label, amount: l.amount })),
      discounts: inv.discounts.map((d) => ({ label: d.label, amount: d.amount })),
      installments: st.installments.map((i) => ({
        label: i.label,
        amount: i.amount,
        due: i.due,
        paid: i.paid,
        status: i.status,
      })),
    };
  }

  /** What a parent can choose to pay: everything, the overdue installment, this term, or old balances. */
  options(v: FinView, studentId: string): PayOption[] {
    const invoices = this.invoicesOf(v, studentId).filter((i) => unclaimed(v, i.id) > 0);
    if (!invoices.length) return [];
    const current = this.currentInvoice(v, invoices);
    const older = invoices.filter((i) => i.id !== current?.id);
    const out: PayOption[] = [];
    const all = invoices.map((i) => ({ invoiceId: i.id, amount: unclaimed(v, i.id) }));
    const total = sum(all.map((a) => a.amount));
    out.push({
      key: 'all',
      label: `Everything outstanding · ${money(total)}`,
      detail: older.length ? 'Oldest balance first' : 'This term’s fees in full',
      amount: total,
      allocations: all,
    });
    if (current) {
      const st = v.ledger.invoice(current.id);
      const due = st.installments.filter((i) => i.status === 'Overdue');
      const owed = Math.min(
        unclaimed(v, current.id),
        sum(due.map((i) => i.amount - i.paid)) - st.pending,
      );
      if (due.length && owed > 0 && owed < total)
        out.push({
          key: 'overdue',
          label: `Overdue ${due.length > 1 ? 'installments' : 'installment'} · ${money(owed)}`,
          detail: `${this.period(v, current)} · ${due.map((i) => i.label.toLowerCase()).join(', ')} (due ${shortDate(due[0]!.due)})`,
          amount: owed,
          allocations: [{ invoiceId: current.id, amount: owed }],
        });
      const cur = unclaimed(v, current.id);
      if (older.length && cur > 0)
        out.push({
          key: 'current',
          label: `This term only · ${money(cur)}`,
          detail: this.period(v, current),
          amount: cur,
          allocations: [{ invoiceId: current.id, amount: cur }],
        });
    }
    if (older.length && current) {
      const prev = older.map((i) => ({ invoiceId: i.id, amount: unclaimed(v, i.id) }));
      const amount = sum(prev.map((a) => a.amount));
      out.push({
        key: 'previous',
        label: `Earlier balance · ${money(amount)}`,
        detail: older.map((i) => this.period(v, i)).join(', '),
        amount,
        allocations: prev,
      });
    }
    return out;
  }

  /** Where to pay: the school's parent-facing account(s) and the narration to use. */
  private payTo(v: FinView, studentId: string) {
    const s = v.fin.students.get(studentId);
    if (!s) return null;
    const accs = v.fin.accounts.filter(
      (a) => a.status === 'Active' && a.showToParents && a.kind === 'Bank',
    );
    const mine = accs.filter((a) => a.branchId === s.branchId);
    const shown = mine.length ? mine : accs.filter((a) => !a.branchId);
    const list = shown.length ? shown : accs;
    if (!list.length) return null;
    const details = v.payTo(s, 0);
    return {
      accounts: list.map((a) => ({
        id: a.id,
        bank: a.bank,
        accountNumber: a.accountNumber,
        accountName: a.accountName,
      })),
      reference: details?.reference ?? s.admissionNo,
      referenceKind:
        v.fin.settings.transferReference === 'Invoice number' ? 'invoice' : 'admission',
    };
  }

  /** Whether this guardian may pay, and why not. */
  private payRule(scope: ChildScope, payTo: unknown) {
    if (!scope.link.paysFees)
      return 'Another guardian pays this child’s fees, so you can see them but not pay here.';
    if (!payTo)
      return 'The school hasn’t shared its bank details here yet. Contact the school to pay.';
    return null;
  }

  /** A child's fee summary for the switcher and home cards. */
  static summary(v: FinView, studentId: string) {
    const invoices = v.fin.invoices.filter(
      (i) => i.studentKey === studentId && i.status === 'Issued',
    );
    const states = invoices.map((i) => v.ledger.invoice(i.id));
    return {
      outstanding: sum(states.map((s) => s.balance)),
      pending: sum(states.map((s) => s.pending)),
      overdue: states.some((s) => s.overdue),
    };
  }

  /** Fee summaries for several children with one load of the school's finance. */
  async summaries(auth: AuthUserContext, studentIds: string[]) {
    const v = await this.load(auth);
    return new Map(studentIds.map((id) => [id, ParentFeesService.summary(v, id)]));
  }

  /** `GET /v1/parent/children/:id/payments/:paymentId/receipt`: a confirmed payment's PDF. */
  async receipt(auth: AuthUserContext, scope: ChildScope, paymentId: string) {
    const v = await this.load(auth);
    const p = v.fin.payments.find((x) => x.id === paymentId && x.studentKey === scope.student.id);
    if (!p) throw AppException.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    const school = await documentSchool(
      this.scope.db as unknown as TenantTx,
      auth.schoolId!,
      v.fin.students.get(p.studentKey)?.branchId,
    );
    return paymentReceipt(v, p, school, this.scope.now());
  }

  /** `GET /v1/parent/children/:id/fees`. */
  async fees(auth: AuthUserContext, scope: ChildScope) {
    const v = await this.load(auth);
    const id = scope.student.id;
    const invoices = this.invoicesOf(v, id);
    const current = this.currentInvoice(v, invoices);
    const older = invoices
      .filter((i) => i.id !== current?.id && v.ledger.invoice(i.id).balance > 0)
      .reverse();
    const payTo = this.payTo(v, id);
    const blocked = this.payRule(scope, payTo);
    const summary = ParentFeesService.summary(v, id);
    const payments = v.fin.payments
      .filter((p) => p.studentKey === id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
      .map((p) => ({
        id: p.id,
        number: p.no,
        date: p.date,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        status: p.status,
        byParent: p.source === 'Parent claim',
        payer: p.payer,
        proofName: p.proof,
        rejectReason: p.status === 'Rejected' ? p.rejectReason || null : null,
        invoices: p.allocations.map(
          (a) => v.fin.invoices.find((i) => i.id === a.invoiceId)?.no ?? '',
        ),
      }));
    const term = v.currentTerm();
    return {
      term: term ? { id: term.id, label: `${term.name} · ${term.session}` } : null,
      canPay: !blocked,
      payBlockedReason: blocked,
      readOnly: scope.link.access !== 'full',
      totals: {
        outstanding: summary.outstanding,
        pending: summary.pending,
        overdue: summary.overdue,
        credit: v.ledger.credit(id),
      },
      current: current ? this.invoiceView(v, current, true) : null,
      previous: older.map((i) => this.invoiceView(v, i, false)),
      payments,
      payTo: blocked ? null : payTo,
      options: blocked ? [] : this.options(v, id).map(({ allocations: _a, ...o }) => o),
    };
  }

  /**
   * `POST /v1/parent/children/:id/fees/claims`: "I've paid by transfer". Records a pending
   * parent claim with the proof; the bursar verifies it in Finance › Payments.
   */
  async claim(auth: AuthUserContext, scope: ChildScope, dto: FeeClaimDto) {
    const today = this.scope.today();
    if (dto.paidOn > today)
      throw AppException.validation({ paidOn: 'The transfer date can’t be in the future.' });
    if (!scope.link.paysFees)
      throw AppException.forbidden(
        'Another guardian pays this child’s fees, so you can’t pay here.',
        'NOT_FEE_PAYER',
      );
    const proof = await this.scope.db.storedFile.findFirst({
      where: { id: dto.proofFileId, deletedAt: null },
      include: { _count: { select: { payments: true } } },
    });
    if (!proof || proof.uploadedById !== auth.userId || proof._count.payments > 0)
      throw AppException.validation({
        proofFileId: 'Attach the transfer receipt again.',
      });
    if (!PROOF_TYPES.has(proof.mimeType))
      throw AppException.validation({
        proofFileId: 'Attach a photo, screenshot or PDF of the transfer receipt.',
      });
    const reference = (dto.reference ?? '').trim();
    const note = (dto.note ?? '').trim();
    const studentId = scope.student.id;
    const payer = guardianDisplay(scope.guardian);
    const result = await this.scope.db.$transaction(
      async (tx) => {
        const db = tx as unknown as TenantTx;
        const v = await financeView(db, auth.schoolId!, this.scope.now());
        const option = this.options(v, studentId).find((o) => o.key === dto.option);
        if (!option)
          throw AppException.conflict(
            'There’s nothing left to pay for that. Your earlier transfer may still be being verified.',
            'NOTHING_TO_PAY',
          );
        const to = this.payTo(v, studentId);
        if (!to)
          throw AppException.conflict(
            'The school hasn’t shared its bank details here yet. Contact the school to pay.',
            'NO_BANK_ACCOUNT',
          );
        const s = v.fin.students.get(studentId)!;
        const accountId =
          (dto.accountId && to.accounts.find((a) => a.id === dto.accountId)?.id) ||
          to.accounts[0]!.id;
        const number = await this.finance.nextNumber(
          db,
          'receipt',
          v.fin.settings.receiptPrefix,
          dto.paidOn.slice(0, 4),
        );
        const row = await tx.payment.create({
          data: {
            schoolId: auth.schoolId!,
            number,
            studentId,
            paidOn: dateOnly(dto.paidOn),
            payerName: payer,
            method: 'BANK_TRANSFER',
            reference: reference || to.reference,
            bankAccountId: accountId,
            branchId: s.branchId,
            amountKobo: kobo(option.amount),
            status: 'PENDING_VERIFICATION',
            source: 'PARENT_CLAIM',
            claimedByGuardianId: scope.guardian.id,
            proofFileId: proof.id,
            proofName: proof.originalName,
            note,
          },
        });
        await tx.paymentAllocation.createMany({
          data: option.allocations.map((a) => ({
            schoolId: auth.schoolId!,
            paymentId: row.id,
            invoiceId: a.invoiceId,
            amountKobo: kobo(a.amount),
          })),
        });
        await this.finance.log(db, [
          {
            entity: 'Payment',
            entityId: row.id,
            action: 'payment.claim',
            title: 'Transfer reported by parent',
            detail: `${money(option.amount)} for ${s.name} · ${payer} · Parent Portal · proof ${proof.originalName}`,
            tone: 'warning',
          },
          ...option.allocations.map((a) => ({
            entity: 'Invoice',
            entityId: a.invoiceId,
            action: 'invoice.payment',
            title: `Payment ${money(a.amount)} · bank transfer`,
            detail: `${number} · pending verification (Parent Portal)`,
            tone: 'warning' as const,
          })),
        ]);
        return { id: row.id, number, amount: option.amount };
      },
      { timeout: 60_000 },
    );
    return {
      id: result.id,
      number: result.number,
      amount: result.amount,
      status: 'Pending verification',
    };
  }
}
