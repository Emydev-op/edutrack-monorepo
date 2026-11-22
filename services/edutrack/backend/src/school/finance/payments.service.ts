import { documentSchool, paymentReceipt } from './receipts.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import { isUuid } from '../../platform/shared/params.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { FinanceCore, type FinLog } from './finance-core.service.js';
import type { FinStudent, PaymentRec, RefundRec } from './finance-data.js';
import {
  ALL_METHODS,
  METHOD_DB,
  addDays,
  dateOnly,
  finConflict,
  finFail,
  kobo,
  money,
  notFound,
  plural,
  requireDate,
  requireMoney,
  requireText,
  sum,
  type MethodLabel,
} from './finance-format.js';
import { allocateOldestFirst } from './finance-ledger.js';
import { FinanceNotifyService, type FeeMessage } from './finance-notify.service.js';
import type { FinView } from './finance-view.js';
import type {
  ApproveRefundDto,
  PaymentDto,
  PaymentQuery,
  PayOutDto,
  RefundDto,
  RefundQuery,
} from './dto/payments.dto.js';

type Flush = () => Promise<void>;
const NOOP: Flush = () => Promise.resolve();

const fmtDate = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Finance › Payments and refunds (as the School Admin mock's `finance-payments.ts`). EduTrack
 * never holds money: the bursar records what the school received (cash, POS, cheque, transfer),
 * or verifies a transfer a parent says they made (with proof) against the bank statement. Only
 * confirmed payments reduce balances; a payment is allocated to open invoices oldest first and
 * anything left is credit, which can be refunded once approved.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly core: FinanceCore,
    private readonly notify: FinanceNotifyService,
  ) {}

  /* ---------------- Look-ups ---------------- */

  findPayment(v: FinView, id: string): PaymentRec {
    const p = v.fin.payments.find((x) => (isUuid(id) && x.id === id.toLowerCase()) || x.no === id);
    if (!p) throw notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    return p;
  }

  private findRefund(v: FinView, id: string): RefundRec {
    const r = v.fin.refunds.find((x) => (isUuid(id) && x.id === id.toLowerCase()) || x.no === id);
    if (!r) throw notFound('Refund not found', 'REFUND_NOT_FOUND');
    return r;
  }

  /* ---------------- List ---------------- */

  async list(q: PaymentQuery) {
    const v = await this.core.load();
    const branchId = v.branchScope(q.branch);
    const inBranch = v.fin.payments.filter(
      (p) => !branchId || v.students.get(p.studentKey)?.branchId === branchId,
    );
    const search = (q.search ?? '').trim().toLowerCase();
    const rows = inBranch
      .filter((p) => (q.tab === 'pending' ? p.status === 'Pending verification' : true))
      .filter((p) => !q.method || p.method === q.method)
      .filter((p) => !q.status || p.status === q.status)
      .filter((p) => !q.source || p.source === q.source)
      .filter((p) => (!q.from || p.date >= q.from) && (!q.to || p.date <= q.to))
      .map((p) => v.paymentRow(p))
      .filter(
        (p) =>
          !search ||
          `${p.no} ${p.student} ${p.payer} ${p.reference} ${p.invoices.join(' ')}`
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) =>
        q.tab === 'pending'
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date) || b.no.localeCompare(a.no),
      );
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const page = Math.max(1, Number(q.page) || 1);
    const confirmed = inBranch.filter((p) => p.status === 'Confirmed');
    const pending = inBranch.filter((p) => p.status === 'Pending verification');
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      },
      summary: {
        confirmed: sum(confirmed.map((p) => p.amount)),
        confirmedCount: confirmed.length,
        pending: sum(pending.map((p) => p.amount)),
        pendingCount: pending.length,
        rejectedCount: inBranch.filter((p) => p.status === 'Rejected').length,
        today: sum(confirmed.filter((p) => p.date === v.today).map((p) => p.amount)),
        byMethod: ALL_METHODS.map((method) => {
          const m = confirmed.filter((p) => p.method === method);
          return { method, amount: sum(m.map((p) => p.amount)), count: m.length };
        }).filter((m) => m.count),
      },
    };
  }

  /* ---------------- Detail ---------------- */

  async paymentDetail(v: FinView, p: PaymentRec) {
    return {
      ...v.paymentRow(p),
      accountId: p.accountId,
      allocations: p.allocations.map((a) => {
        const inv = v.fin.invoices.find((i) => i.id === a.invoiceId)!;
        const t = v.terms.find((x) => x.id === inv.termId);
        return {
          invoiceId: inv.id,
          no: inv.no,
          term: `${t?.session} · ${t?.name}`,
          amount: a.amount,
          balanceAfter: v.ledger.invoice(inv.id).balance,
        };
      }),
      note: p.note,
      proof: p.proof,
      verifiedBy: p.verifiedBy,
      verifiedOn: p.verifiedOn,
      rejectReason: p.rejectReason,
      studentCredit: v.ledger.credit(p.studentKey),
      refunds: v.fin.refunds.filter((r) => r.paymentId === p.id).map((r) => v.refundRow(r)),
      balanceNow: v.outstandingOf(p.studentKey),
      history: await this.core.history('Payment', p.id),
    };
  }

  /** A confirmed payment's receipt PDF. */
  async receipt(id: string) {
    const v = await this.core.load();
    const p = this.findPayment(v, id);
    const school = await documentSchool(
      this.core.db,
      this.core.schoolId(),
      v.fin.students.get(p.studentKey)?.branchId,
    );
    return paymentReceipt(v, p, school, this.core.now());
  }

  async get(id: string) {
    const v = await this.core.load();
    return this.paymentDetail(v, this.findPayment(v, id));
  }

  private async detailOf(id: string) {
    const v = await this.core.load();
    return this.paymentDetail(v, this.findPayment(v, id));
  }

  /* ---------------- Record ---------------- */

  private validate(v: FinView, p: PaymentDto) {
    const s = v.studentOf(requireText(p.studentKey, 'Choose the student this payment is for.'));
    const amount = requireMoney(p.amount, 'Enter the amount received in naira.');
    const date = requireDate(p.date, 'Enter the date the money was received.');
    if (date > v.today) throw finFail('The payment date can’t be in the future.', 'VALIDATION');
    if (date < addDays(v.sessionRange().start, -120))
      throw finFail('That date is before this session’s billing started.', 'VALIDATION');
    const method = p.method as MethodLabel;
    if (!v.fin.settings.methods.includes(method))
      throw finFail(
        `${method || 'That method'} isn’t accepted. Allowed: ${v.fin.settings.methods.join(', ')}.`,
        'VALIDATION',
      );
    const account = v.fin.accounts.find((a) => a.id === p.accountId && a.status === 'Active');
    if (!account) throw finFail('Choose the account the money went into.', 'VALIDATION');
    if (method === 'Cash' && account.kind !== 'Cash')
      throw finFail('Cash goes into a cash account.', 'VALIDATION');
    if (method !== 'Cash' && account.kind === 'Cash')
      throw finFail(`A ${method.toLowerCase()} payment goes into a bank account.`, 'VALIDATION');
    const reference = (p.reference ?? '').trim();
    if (['Bank transfer', 'POS', 'Cheque'].includes(method) && !reference)
      throw finFail(
        method === 'Cheque'
          ? 'Enter the cheque number.'
          : 'Enter the transaction reference from the bank alert or POS slip.',
        'VALIDATION',
      );
    if (reference) {
      const dupe = v.fin.payments.find(
        (x) => x.reference.toLowerCase() === reference.toLowerCase() && x.status !== 'Rejected',
      );
      if (dupe)
        throw finFail(
          `That reference is already on ${dupe.no} (${money(dupe.amount)}, ${fmtDate(dupe.date)}). Check it isn’t the same payment.`,
          'DUPLICATE_REFERENCE',
        );
    }
    const owed = v.outstandingOf(s.key);
    if (!v.fin.settings.allowPartial && amount < owed && owed > 0)
      throw finFail(
        `Part payments are switched off. Enter the full balance of ${money(owed)}, or allow part payments in Fees › Billing settings.`,
        'PART_PAYMENT_OFF',
      );
    const open = v.openInvoices(s.key);
    let allocations = (p.allocations ?? []).filter((a) => a.amount > 0);
    if (!allocations.length)
      allocations = allocateOldestFirst(
        open.map((i) => ({ id: i.id, balance: v.ledger.invoice(i.id).balance })),
        amount,
      );
    for (const a of allocations) {
      const inv = open.find((i) => i.id === a.invoiceId);
      if (!inv) throw finFail('Allocate only to this student’s unpaid invoices.', 'VALIDATION');
      requireMoney(a.amount, 'Allocations must be whole naira.');
      if (a.amount > v.ledger.invoice(inv.id).balance)
        throw finFail(
          `${inv.no} only has ${money(v.ledger.invoice(inv.id).balance)} left to pay.`,
          'VALIDATION',
        );
    }
    if (sum(allocations.map((a) => a.amount)) > amount)
      throw finFail('You’ve allocated more than the amount received.', 'VALIDATION');
    return {
      s,
      amount,
      date,
      method,
      account,
      reference,
      allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
      payer: (p.payer ?? '').trim() || s.payer || 'Walk-in payer',
      note: (p.note ?? '').trim(),
      matched: !!p.matched,
    };
  }

  async check(dto: PaymentDto) {
    const v = await this.core.load();
    const x = this.validate(v, dto);
    const credit = x.amount - sum(x.allocations.map((a) => a.amount));
    return {
      status:
        x.method === 'Bank transfer' && v.fin.settings.verifyTransfers && !x.matched
          ? 'Pending verification'
          : 'Confirmed',
      allocations: x.allocations.map((a) => {
        const inv = v.fin.invoices.find((i) => i.id === a.invoiceId)!;
        const before = v.ledger.invoice(inv.id).balance;
        return {
          invoiceId: inv.id,
          no: inv.no,
          amount: a.amount,
          before,
          after: before - a.amount,
        };
      }),
      credit,
    };
  }

  async record(dto: PaymentDto) {
    let flush = NOOP;
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const x = this.validate(v, dto);
      const pending = x.method === 'Bank transfer' && v.fin.settings.verifyTransfers && !x.matched;
      const schoolId = this.core.schoolId();
      const userId = this.core.userId();
      const now = this.core.now();
      const number = await this.core.nextNumber(
        tx,
        'receipt',
        v.fin.settings.receiptPrefix,
        x.date.slice(0, 4),
      );
      const verifiedNow = !pending && x.method === 'Bank transfer';
      const row = await tx.payment.create({
        data: {
          schoolId,
          number,
          studentId: x.s.key,
          paidOn: dateOnly(x.date),
          payerName: x.payer,
          method: METHOD_DB[x.method],
          reference: x.reference,
          bankAccountId: x.account.id,
          branchId: x.s.branchId,
          amountKobo: kobo(x.amount),
          status: pending ? 'PENDING_VERIFICATION' : 'CONFIRMED',
          source: 'SCHOOL',
          recordedById: userId,
          verifiedById: verifiedNow ? userId : null,
          verifiedAt: verifiedNow ? now : null,
          note: x.note,
        },
      });
      if (x.allocations.length)
        await tx.paymentAllocation.createMany({
          data: x.allocations.map((a) => ({
            schoolId,
            paymentId: row.id,
            invoiceId: a.invoiceId,
            amountKobo: kobo(a.amount),
          })),
        });
      await this.core.syncInvoices(
        tx,
        x.allocations.map((a) => a.invoiceId),
      );
      const logs: FinLog[] = [
        {
          entity: 'Payment',
          entityId: row.id,
          action: 'payment.record',
          title: 'Payment recorded',
          detail: `${x.method}${x.reference ? ` · ${x.reference}` : ''} · ${money(x.amount)} for ${x.s.name}`,
        },
      ];
      if (verifiedNow)
        logs.push({
          entity: 'Payment',
          entityId: row.id,
          action: 'payment.verify',
          title: 'Matched on the bank statement',
          tone: 'success',
        });
      for (const a of x.allocations)
        logs.push({
          entity: 'Invoice',
          entityId: a.invoiceId,
          action: 'invoice.payment',
          title: `Payment ${money(a.amount)} · ${x.method.toLowerCase()}`,
          detail: `${number} · ${pending ? 'pending verification' : 'confirmed'}`,
          tone: pending ? 'warning' : 'success',
        });
      await this.core.log(tx, logs);
      if (!pending) flush = await this.confirmedMessage(tx, [row.id]);
      return row.id;
    });
    await flush();
    return this.detailOf(id);
  }

  /** Tells payers their payments were received (the "Payment received" event). */
  async confirmedMessage(tx: TenantTx, ids: string[]): Promise<Flush> {
    if (!ids.length) return NOOP;
    const v = await this.core.load(tx);
    const messages: FeeMessage[] = v.fin.payments
      .filter((p) => ids.includes(p.id))
      .map((p) => ({
        studentKey: p.studentKey,
        vars: {
          amount: money(p.amount),
          receipt_no: p.no,
          balance: money(v.outstandingOf(p.studentKey)),
        },
      }));
    const title =
      messages.length === 1
        ? `Receipt ${messages[0]!.vars.receipt_no}`
        : `${plural(messages.length, 'receipt')}`;
    const sent = await this.notify.send(tx, v, 'payment.confirmed', title, messages);
    return sent.flush;
  }

  /* ---------------- Verify & reject ---------------- */

  /**
   * Verifies a pending payment in the caller's transaction: the money goes where it was meant
   * to, capped at what each invoice still owes, then to the oldest open balances; the rest is
   * credit. Also used by statement matching.
   */
  async verifyPayment(
    tx: TenantTx,
    v: FinView,
    p: PaymentRec,
    how: string,
    opts: { accountId?: string } = {},
  ) {
    if (p.status !== 'Pending verification')
      throw finConflict(`${p.no} is already ${p.status.toLowerCase()}.`, 'PAYMENT_NOT_PENDING');
    const open = v.openInvoices(p.studentKey).map((i) => ({
      id: i.id,
      balance: v.ledger.invoice(i.id).balance,
    }));
    const out: { invoiceId: string; amount: number }[] = [];
    let left = p.amount;
    for (const a of p.allocations) {
      const inv = open.find((o) => o.id === a.invoiceId);
      const take = Math.min(a.amount, inv?.balance ?? 0, left);
      if (take > 0) {
        out.push({ invoiceId: a.invoiceId, amount: take });
        inv!.balance -= take;
        left -= take;
      }
    }
    for (const extra of allocateOldestFirst(
      open.filter((o) => o.balance > 0),
      left,
    )) {
      const same = out.find((o) => o.invoiceId === extra.invoiceId);
      if (same) same.amount += extra.amount;
      else out.push(extra);
    }
    const schoolId = this.core.schoolId();
    await tx.paymentAllocation.deleteMany({ where: { paymentId: p.id } });
    if (out.length)
      await tx.paymentAllocation.createMany({
        data: out.map((a) => ({
          schoolId,
          paymentId: p.id,
          invoiceId: a.invoiceId,
          amountKobo: kobo(a.amount),
        })),
      });
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'CONFIRMED',
        verifiedById: this.core.userId(),
        verifiedAt: this.core.now(),
        ...(opts.accountId && { bankAccountId: opts.accountId }),
      },
    });
    await this.core.syncInvoices(tx, [
      ...out.map((a) => a.invoiceId),
      ...p.allocations.map((a) => a.invoiceId),
    ]);
    await this.core.log(tx, [
      {
        entity: 'Payment',
        entityId: p.id,
        action: 'payment.verify',
        title: 'Verified',
        detail: how,
        tone: 'success',
      },
      ...out.map((a) => ({
        entity: 'Invoice',
        entityId: a.invoiceId,
        action: 'invoice.payment',
        title: `Payment ${money(a.amount)} confirmed`,
        detail: p.no,
        tone: 'success' as const,
      })),
    ]);
  }

  async verify(id: string) {
    let flush = NOOP;
    const paymentId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const p = this.findPayment(v, id);
      await this.verifyPayment(tx, v, p, 'matched on the bank statement');
      flush = await this.confirmedMessage(tx, [p.id]);
      return p.id;
    });
    await flush();
    return this.detailOf(paymentId);
  }

  async verifyBulk(ids: string[] = []) {
    let flush = NOOP;
    const result = await this.core.write(async (tx) => {
      let v = await this.core.load(tx);
      const list = v.fin.payments.filter(
        (p) => ids.includes(p.id) && p.status === 'Pending verification',
      );
      if (!list.length)
        throw finFail('Select payments waiting for verification.', 'NOTHING_TO_VERIFY');
      for (const { id } of list) {
        const p = v.fin.payments.find((x) => x.id === id)!;
        await this.verifyPayment(tx, v, p, 'matched on the bank statement');
        v = await this.core.load(tx);
      }
      flush = await this.confirmedMessage(
        tx,
        list.map((p) => p.id),
      );
      return { verified: list.length, total: sum(list.map((p) => p.amount)) };
    });
    await flush();
    return result;
  }

  async reject(id: string, reasonIn?: string) {
    let flush = NOOP;
    const paymentId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const p = this.findPayment(v, id);
      if (p.status !== 'Pending verification')
        throw finConflict(
          'Only payments waiting for verification can be rejected.',
          'PAYMENT_NOT_PENDING',
        );
      const reason = requireText(reasonIn, 'Say why, so the payer knows what to send.');
      await tx.payment.update({
        where: { id: p.id },
        data: { status: 'REJECTED', rejectReason: reason },
      });
      await this.core.syncInvoices(
        tx,
        p.allocations.map((a) => a.invoiceId),
      );
      await this.core.log(tx, [
        {
          entity: 'Payment',
          entityId: p.id,
          action: 'payment.reject',
          title: 'Rejected',
          detail: `${reason} · payer notified to resend proof`,
          tone: 'error',
        },
      ]);
      const sent = await this.notify.send(tx, v, 'payment.rejected', `${p.no} not confirmed`, [
        { studentKey: p.studentKey, vars: { amount: money(p.amount), reason } },
      ]);
      flush = sent.flush;
      return p.id;
    });
    await flush();
    return this.detailOf(paymentId);
  }

  /* ---------------- Refunds ---------------- */

  private refundDetail(v: FinView, r: RefundRec) {
    return this.core.history('Refund', r.id).then((history) => ({
      ...v.refundRow(r),
      paymentId: r.paymentId,
      payTo: r.payTo,
      paidFrom: v.fin.accounts.find((a) => a.id === r.paidFrom)?.name ?? null,
      paidOn: r.paidOn,
      paidRef: r.paidRef,
      rejectReason: r.rejectReason,
      creditBefore: v.ledger.credit(r.studentKey) + (r.status === 'Rejected' ? 0 : r.amount),
      history,
    }));
  }

  private async refundOf(id: string) {
    const v = await this.core.load();
    return this.refundDetail(v, this.findRefund(v, id));
  }

  async refunds(q: RefundQuery) {
    const v = await this.core.load();
    const branchId = v.branchScope(q.branch);
    const rows = v.fin.refunds
      .filter((r) => !branchId || v.students.get(r.studentKey)?.branchId === branchId)
      .filter((r) => !q.status || r.status === q.status)
      .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn))
      .map((r) => v.refundRow(r));
    return {
      rows,
      awaiting: rows.filter((r) => r.status === 'Awaiting approval').length,
      toPay: rows.filter((r) => r.status === 'Approved').length,
      paid: sum(rows.filter((r) => r.status === 'Paid').map((r) => r.amount)),
    };
  }

  getRefund(id: string) {
    return this.refundOf(id);
  }

  async requestRefund(dto: RefundDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const s: FinStudent = v.studentOf(requireText(dto.studentKey, 'Choose the student.'));
      const amount = requireMoney(dto.amount, 'Enter the refund amount.');
      const reason = requireText(dto.reason, 'Give the reason for the refund.', 500);
      const payTo = requireText(dto.payTo, 'Enter where the refund is paid (bank and account).');
      const credit = v.ledger.credit(s.key);
      if (!credit)
        throw finFail(
          `${s.name} has no credit to refund. Remove the wrong charge or cancel the invoice first; the money paid becomes credit.`,
          'NO_CREDIT',
        );
      if (amount > credit)
        throw finFail(`Only ${money(credit)} credit is available to refund.`, 'NO_CREDIT');
      const payment = dto.paymentId
        ? v.fin.payments.find(
            (x) => x.id === dto.paymentId && x.studentKey === s.key && x.status === 'Confirmed',
          )
        : null;
      if (dto.paymentId && !payment)
        throw finFail('Choose one of this student’s confirmed payments.', 'VALIDATION');
      const number = await this.core.nextNumber(tx, 'refund', 'RFD', v.today.slice(0, 4));
      const row = await tx.refund.create({
        data: {
          schoolId: this.core.schoolId(),
          number,
          studentId: s.key,
          paymentId: payment?.id ?? null,
          amountKobo: kobo(amount),
          reason,
          payTo,
          status: 'AWAITING_APPROVAL',
          approverLevel: amount > v.fin.settings.refundLimit ? 'PROPRIETOR' : 'PRINCIPAL',
          requestedById: this.core.userId(),
          requestedAt: this.core.now(),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Refund',
          entityId: row.id,
          action: 'refund.request',
          title: 'Refund requested',
          detail: `${money(amount)} from credit on account for ${s.name}`,
        },
      ]);
      return row.id;
    });
    return this.refundOf(id);
  }

  async approveRefund(id: string, dto: ApproveRefundDto) {
    const refundId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const r = this.findRefund(v, id);
      if (r.status !== 'Awaiting approval')
        throw finConflict(`${r.no} is ${r.status.toLowerCase()}.`, 'REFUND_NOT_AWAITING');
      if (!dto.acknowledged)
        throw finFail('Confirm you have checked the reason for the refund.', 'VALIDATION');
      const limit = v.fin.settings.refundLimit;
      const overLimit = r.amount > limit;
      if (overLimit && !dto.asProprietor)
        throw finFail(
          `Refunds above ${money(limit)} need the Proprietor’s approval.`,
          'PROPRIETOR_APPROVAL',
          HttpStatus.FORBIDDEN,
        );
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: 'APPROVED',
          approvedById: this.core.userId(),
          approvedAt: this.core.now(),
          approverLevel: overLimit ? 'PROPRIETOR' : 'PRINCIPAL',
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Refund',
          entityId: r.id,
          action: 'refund.approve',
          title: 'Approved',
          detail: overLimit ? 'Proprietor’s approval recorded' : `within ${money(limit)} limit`,
          tone: 'success',
        },
      ]);
      return r.id;
    });
    return this.refundOf(refundId);
  }

  async rejectRefund(id: string, reasonIn?: string) {
    const refundId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const r = this.findRefund(v, id);
      if (r.status !== 'Awaiting approval' && r.status !== 'Approved')
        throw finConflict(`${r.no} is ${r.status.toLowerCase()}.`, 'REFUND_CLOSED');
      const reason = requireText(reasonIn, 'Give a reason.', 500);
      await tx.refund.update({
        where: { id: r.id },
        data: { status: 'REJECTED', rejectReason: reason },
      });
      await this.core.log(tx, [
        {
          entity: 'Refund',
          entityId: r.id,
          action: 'refund.reject',
          title: 'Rejected',
          detail: `${reason} · ${money(r.amount)} stays as credit`,
          tone: 'error',
        },
      ]);
      return r.id;
    });
    return this.refundOf(refundId);
  }

  async payRefund(id: string, dto: PayOutDto) {
    let flush = NOOP;
    const refundId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const r = this.findRefund(v, id);
      if (r.status !== 'Approved')
        throw finConflict('Only an approved refund can be paid out.', 'REFUND_NOT_APPROVED');
      const account = v.fin.accounts.find((a) => a.id === dto.accountId && a.status === 'Active');
      if (!account) throw finFail('Choose the account the refund is paid from.', 'VALIDATION');
      const date = requireDate(dto.date, 'Enter the date it was paid.');
      if (date > v.today) throw finFail('The date can’t be in the future.', 'VALIDATION');
      const balance = v.ledger.accountBalance(account.id);
      if (balance < r.amount)
        throw finFail(`${account.name} only has ${money(balance)}.`, 'INSUFFICIENT_FUNDS');
      const ref = (dto.reference ?? '').trim();
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: 'PAID',
          paidAt: dateOnly(date),
          paidFromAccountId: account.id,
          paidReference: ref,
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Refund',
          entityId: r.id,
          action: 'refund.pay',
          title: 'Paid out',
          detail: `from ${account.name}${ref ? ` · ${ref}` : ''}`,
          tone: 'success',
        },
      ]);
      const sent = await this.notify.send(tx, v, 'refund.paid', `Refund ${r.no}`, [
        { studentKey: r.studentKey, vars: { amount: money(r.amount), refund_no: r.no } },
      ]);
      flush = sent.flush;
      return r.id;
    });
    await flush();
    return this.refundOf(refundId);
  }
}
