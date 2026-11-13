import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  PaymentDetail,
  PaymentList,
  PaymentMethod,
  PaymentPayload,
  RefundDetail,
  RefundPayload,
} from '@/types';

import { paymentRejected, paymentsConfirmed, refundPaid } from '../comms-events';
import { ALL_METHODS, nextId, nextNo, type PaymentRec, type RefundRec } from '../finance-db';
import { addDays, allocateOldestFirst, isoToday, sum } from '../finance-ledger';
import { fmtDate, plural } from './academics-shared';
import {
  branchNameOf,
  branchScope,
  finFor,
  historyEntry,
  naira,
  openInvoices,
  outstandingOf,
  paymentRow,
  refundRow,
  requireDate,
  requireMoney,
  sessionRange,
  showHistory,
  studentOf,
  type FinCtx,
} from './finance-shared';
import { requireText } from './shared';

function findPayment(ctx: FinCtx, id: string) {
  const p = ctx.fin.payments.find((x) => x.id === id || x.no === id);
  if (!p) throw new MockHttpError(404, 'Payment not found');
  return p;
}

/* ---------------- List ---------------- */

mock.get('/v1/finance/payments', (req): PaymentList => {
  const ctx = finFor(req);
  const q = req.query;
  const branchId = branchScope(ctx, q.branch);
  const inBranch = ctx.fin.payments.filter(
    (p) => !branchId || ctx.students.get(p.studentKey)?.branchId === branchId,
  );
  const search = (q.search ?? '').trim().toLowerCase();
  const rows = inBranch
    .filter((p) => (q.tab === 'pending' ? p.status === 'Pending verification' : true))
    .filter((p) => !q.method || p.method === q.method)
    .filter((p) => !q.status || p.status === q.status)
    .filter((p) => !q.source || p.source === q.source)
    .filter((p) => (!q.from || p.date >= q.from) && (!q.to || p.date <= q.to))
    .map((p) => paymentRow(ctx, p))
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
  const pageSize = Number(q.pageSize ?? 25);
  const page = Math.max(1, Number(q.page ?? 1));
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
      today: sum(confirmed.filter((p) => p.date === isoToday()).map((p) => p.amount)),
      byMethod: ALL_METHODS.map((method) => {
        const m = confirmed.filter((p) => p.method === method);
        return { method, amount: sum(m.map((p) => p.amount)), count: m.length };
      }).filter((m) => m.count),
    },
  };
});

/* ---------------- Detail ---------------- */

export function paymentDetail(ctx: FinCtx, p: PaymentRec): PaymentDetail {
  return {
    ...paymentRow(ctx, p),
    accountId: p.accountId,
    allocations: p.allocations.map((a) => {
      const inv = ctx.fin.invoices.find((i) => i.id === a.invoiceId)!;
      const t = ctx.terms.find((x) => x.id === inv.termId);
      return {
        invoiceId: inv.id,
        no: inv.no,
        term: `${t?.session} · ${t?.name}`,
        amount: a.amount,
        balanceAfter: ctx.ledger.invoice(inv.id).balance,
      };
    }),
    note: p.note,
    proof: p.proof,
    verifiedBy: p.verifiedBy,
    verifiedOn: p.verifiedOn,
    rejectReason: p.rejectReason,
    studentCredit: ctx.ledger.credit(p.studentKey),
    refunds: ctx.fin.refunds.filter((r) => r.paymentId === p.id).map((r) => refundRow(ctx, r)),
    balanceNow: outstandingOf(ctx, p.studentKey),
    history: showHistory(p.history),
  };
}

mock.get('/v1/finance/payments/:id', (req) => {
  const ctx = finFor(req);
  return paymentDetail(ctx, findPayment(ctx, req.params.id!));
});

/* ---------------- Record ---------------- */

function validatePayment(ctx: FinCtx, body: unknown) {
  const p = (body ?? {}) as Partial<PaymentPayload>;
  const s = studentOf(ctx, requireText(p.studentKey, 'Choose the student this payment is for.'));
  const amount = requireMoney(p.amount, 'Enter the amount received in naira.');
  const date = requireDate(p.date, 'Enter the date the money was received.');
  if (date > isoToday()) throw new MockHttpError(422, 'The payment date can’t be in the future.');
  if (date < addDays(sessionRange(ctx).start, -120))
    throw new MockHttpError(422, 'That date is before this session’s billing started.');
  const method = p.method as PaymentMethod;
  if (!ctx.fin.settings.methods.includes(method))
    throw new MockHttpError(
      422,
      `${method || 'That method'} isn’t accepted. Allowed: ${ctx.fin.settings.methods.join(', ')}.`,
    );
  const account = ctx.fin.accounts.find((a) => a.id === p.accountId && a.status === 'Active');
  if (!account) throw new MockHttpError(422, 'Choose the account the money went into.');
  if (method === 'Cash' && account.kind !== 'Cash')
    throw new MockHttpError(422, 'Cash goes into a cash account.');
  if (method !== 'Cash' && account.kind === 'Cash')
    throw new MockHttpError(422, `A ${method.toLowerCase()} payment goes into a bank account.`);
  const reference = (p.reference ?? '').trim();
  if (['Bank transfer', 'POS', 'Cheque'].includes(method) && !reference)
    throw new MockHttpError(
      422,
      method === 'Cheque'
        ? 'Enter the cheque number.'
        : 'Enter the transaction reference from the bank alert or POS slip.',
    );
  if (reference) {
    const dupe = ctx.fin.payments.find(
      (x) => x.reference.toLowerCase() === reference.toLowerCase() && x.status !== 'Rejected',
    );
    if (dupe)
      throw new MockHttpError(
        422,
        `That reference is already on ${dupe.no} (${naira(dupe.amount)}, ${fmtDate(dupe.date)}). Check it isn’t the same payment.`,
      );
  }
  const owed = outstandingOf(ctx, s.key);
  if (!ctx.fin.settings.allowPartial && amount < owed && owed > 0)
    throw new MockHttpError(
      422,
      `Part payments are switched off. Enter the full balance of ${naira(owed)}, or allow part payments in Fees › Billing settings.`,
    );
  const open = openInvoices(ctx, s.key);
  let allocations = (p.allocations ?? []).filter((a) => a.amount > 0);
  if (!allocations.length)
    allocations = allocateOldestFirst(
      open.map((i) => ({ id: i.id, balance: ctx.ledger.invoice(i.id).balance })),
      amount,
    );
  for (const a of allocations) {
    const inv = open.find((i) => i.id === a.invoiceId);
    if (!inv) throw new MockHttpError(422, 'Allocate only to this student’s unpaid invoices.');
    requireMoney(a.amount, 'Allocations must be whole naira.');
    if (a.amount > ctx.ledger.invoice(inv.id).balance)
      throw new MockHttpError(
        422,
        `${inv.no} only has ${naira(ctx.ledger.invoice(inv.id).balance)} left to pay.`,
      );
  }
  if (sum(allocations.map((a) => a.amount)) > amount)
    throw new MockHttpError(422, 'You’ve allocated more than the amount received.');
  return {
    s,
    amount,
    date,
    method,
    account,
    reference,
    allocations,
    payer: (p.payer ?? '').trim() || s.payer || 'Walk-in payer',
    note: (p.note ?? '').trim(),
    matched: !!p.matched,
  };
}

mock.post('/v1/finance/payments/check', (req) => {
  const ctx = finFor(req);
  const v = validatePayment(ctx, req.body);
  const credit = v.amount - sum(v.allocations.map((a) => a.amount));
  return {
    status:
      v.method === 'Bank transfer' && ctx.fin.settings.verifyTransfers && !v.matched
        ? 'Pending verification'
        : 'Confirmed',
    allocations: v.allocations.map((a) => {
      const inv = ctx.fin.invoices.find((i) => i.id === a.invoiceId)!;
      const before = ctx.ledger.invoice(inv.id).balance;
      return { invoiceId: inv.id, no: inv.no, amount: a.amount, before, after: before - a.amount };
    }),
    credit,
  };
});

mock.post('/v1/finance/payments', (req) => {
  const ctx = finFor(req);
  const v = validatePayment(ctx, req.body);
  const pending = v.method === 'Bank transfer' && ctx.fin.settings.verifyTransfers && !v.matched;
  const p: PaymentRec = {
    id: nextId(ctx.fin, 'pay'),
    no: nextNo(ctx.fin, ctx.fin.settings.receiptPrefix, v.date.slice(0, 4)),
    date: v.date,
    studentKey: v.s.key,
    payer: v.payer,
    method: v.method,
    reference: v.reference,
    accountId: v.account.id,
    amount: v.amount,
    allocations: v.allocations,
    status: pending ? 'Pending verification' : 'Confirmed',
    source: 'School',
    recordedBy: ctx.actor,
    recordedOn: isoToday(),
    verifiedBy: !pending && v.method === 'Bank transfer' ? ctx.actor : null,
    verifiedOn: !pending && v.method === 'Bank transfer' ? isoToday() : null,
    rejectReason: '',
    note: v.note,
    proof: null,
    history: [
      historyEntry(
        'Payment recorded',
        `${ctx.actor} · ${v.method}${v.reference ? ` · ${v.reference}` : ''}`,
      ),
      ...(pending
        ? []
        : v.method === 'Bank transfer'
          ? [historyEntry('Matched on the bank statement', ctx.actor, 'success')]
          : []),
    ],
  };
  ctx.fin.payments.push(p);
  for (const a of p.allocations) {
    const inv = ctx.fin.invoices.find((i) => i.id === a.invoiceId)!;
    inv.history.push(
      historyEntry(
        `Payment ${naira(a.amount)} · ${v.method.toLowerCase()}`,
        `${p.no} · ${pending ? 'pending verification' : 'confirmed'} · ${ctx.actor}`,
        pending ? 'warning' : 'success',
      ),
    );
  }
  ctx.log('finance', `${naira(v.amount)} recorded for ${v.s.name}`, `${p.no} · ${p.status}`);
  const view = paymentDetail(ctx.refresh(), p);
  if (p.status === 'Confirmed') paymentsConfirmed(ctx.schoolId, [p], ctx.actor);
  return view;
});

/** On verification, money goes where it was meant to, capped at what is still owed; the rest is credit. */
function reallocate(ctx: FinCtx, p: PaymentRec) {
  const open = openInvoices(ctx, p.studentKey).map((i) => ({
    id: i.id,
    balance: ctx.ledger.invoice(i.id).balance,
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
  p.allocations = out;
}

function verify(ctx: FinCtx, p: PaymentRec, how: string) {
  if (p.status !== 'Pending verification')
    throw new MockHttpError(409, `${p.no} is already ${p.status.toLowerCase()}.`);
  reallocate(ctx, p);
  p.status = 'Confirmed';
  p.verifiedBy = ctx.actor;
  p.verifiedOn = isoToday();
  p.history.push(historyEntry('Verified', `${ctx.actor} · ${how}`, 'success'));
  for (const a of p.allocations)
    ctx.fin.invoices
      .find((i) => i.id === a.invoiceId)!
      .history.push(
        historyEntry(`Payment ${naira(a.amount)} confirmed`, `${p.no} · ${ctx.actor}`, 'success'),
      );
}

mock.post('/v1/finance/payments/:id/verify', (req) => {
  const ctx = finFor(req);
  const p = findPayment(ctx, req.params.id!);
  verify(ctx, p, 'matched on the bank statement');
  ctx.log('finance', `${p.no} verified`, naira(p.amount));
  const view = paymentDetail(ctx.refresh(), p);
  paymentsConfirmed(ctx.schoolId, [p], ctx.actor);
  return view;
});

mock.post('/v1/finance/payments/verify-bulk', (req) => {
  const ctx = finFor(req);
  const ids = ((req.body as { ids?: string[] })?.ids ?? []) as string[];
  const list = ctx.fin.payments.filter(
    (p) => ids.includes(p.id) && p.status === 'Pending verification',
  );
  if (!list.length) throw new MockHttpError(422, 'Select payments waiting for verification.');
  for (const p of list) {
    verify(ctx, p, 'matched on the bank statement');
    ctx.refresh();
  }
  ctx.log(
    'finance',
    `${plural(list.length, 'payment')} verified`,
    naira(sum(list.map((p) => p.amount))),
  );
  paymentsConfirmed(ctx.schoolId, list, ctx.actor);
  return { verified: list.length, total: sum(list.map((p) => p.amount)) };
});

mock.post('/v1/finance/payments/:id/reject', (req) => {
  const ctx = finFor(req);
  const p = findPayment(ctx, req.params.id!);
  if (p.status !== 'Pending verification')
    throw new MockHttpError(409, 'Only payments waiting for verification can be rejected.');
  const reason = requireText(
    (req.body as { reason?: string })?.reason,
    'Say why, so the payer knows what to send.',
  );
  p.status = 'Rejected';
  p.rejectReason = reason;
  p.history.push(
    historyEntry('Rejected', `${ctx.actor} · ${reason} · payer notified to resend proof`, 'error'),
  );
  ctx.log('finance', `${p.no} rejected`, reason);
  const view = paymentDetail(ctx.refresh(), p);
  paymentRejected(ctx.schoolId, p, ctx.actor);
  return view;
});

/* ---------------- Refunds ---------------- */

function findRefund(ctx: FinCtx, id: string) {
  const r = ctx.fin.refunds.find((x) => x.id === id || x.no === id);
  if (!r) throw new MockHttpError(404, 'Refund not found');
  return r;
}

export function refundDetail(ctx: FinCtx, r: RefundRec): RefundDetail {
  return {
    ...refundRow(ctx, r),
    paymentId: r.paymentId,
    payTo: r.payTo,
    paidFrom: ctx.fin.accounts.find((a) => a.id === r.paidFrom)?.name ?? null,
    paidOn: r.paidOn,
    paidRef: r.paidRef,
    rejectReason: r.rejectReason,
    creditBefore: ctx.ledger.credit(r.studentKey) + (r.status === 'Rejected' ? 0 : r.amount),
    history: showHistory(r.history),
  };
}

mock.get('/v1/finance/refunds', (req) => {
  const ctx = finFor(req);
  const branchId = branchScope(ctx, req.query.branch);
  const rows = ctx.fin.refunds
    .filter((r) => !branchId || ctx.students.get(r.studentKey)?.branchId === branchId)
    .filter((r) => !req.query.status || r.status === req.query.status)
    .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn))
    .map((r) => refundRow(ctx, r));
  return {
    rows,
    awaiting: rows.filter((r) => r.status === 'Awaiting approval').length,
    toPay: rows.filter((r) => r.status === 'Approved').length,
    paid: sum(rows.filter((r) => r.status === 'Paid').map((r) => r.amount)),
  };
});

mock.get('/v1/finance/refunds/:id', (req) => {
  const ctx = finFor(req);
  return refundDetail(ctx, findRefund(ctx, req.params.id!));
});

mock.post('/v1/finance/refunds', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as Partial<RefundPayload>;
  const s = studentOf(ctx, requireText(p.studentKey, 'Choose the student.'));
  const amount = requireMoney(p.amount, 'Enter the refund amount.');
  const reason = requireText(p.reason, 'Give the reason for the refund.');
  const payToText = requireText(p.payTo, 'Enter where the refund is paid (bank and account).');
  const credit = ctx.ledger.credit(s.key);
  if (!credit)
    throw new MockHttpError(
      422,
      `${s.name} has no credit to refund. Remove the wrong charge or cancel the invoice first; the money paid becomes credit.`,
    );
  if (amount > credit)
    throw new MockHttpError(422, `Only ${naira(credit)} credit is available to refund.`);
  const payment = p.paymentId
    ? ctx.fin.payments.find(
        (x) => x.id === p.paymentId && x.studentKey === s.key && x.status === 'Confirmed',
      )
    : null;
  if (p.paymentId && !payment)
    throw new MockHttpError(422, 'Choose one of this student’s confirmed payments.');
  const r: RefundRec = {
    id: nextId(ctx.fin, 'rf'),
    no: nextNo(ctx.fin, 'RFD', isoToday().slice(0, 4)),
    studentKey: s.key,
    paymentId: payment?.id ?? null,
    amount,
    reason,
    payTo: payToText,
    requestedBy: ctx.actor,
    requestedOn: isoToday(),
    status: 'Awaiting approval',
    approvedBy: null,
    approvedOn: null,
    paidOn: null,
    paidFrom: null,
    paidRef: '',
    rejectReason: '',
    history: [
      historyEntry('Refund requested', `${ctx.actor} · ${naira(amount)} from credit on account`),
    ],
  };
  ctx.fin.refunds.push(r);
  ctx.log('finance', `Refund requested for ${s.name}`, `${r.no} · ${naira(amount)}`);
  return refundDetail(ctx.refresh(), r);
});

mock.post('/v1/finance/refunds/:id/approve', (req) => {
  const ctx = finFor(req);
  const r = findRefund(ctx, req.params.id!);
  if (r.status !== 'Awaiting approval')
    throw new MockHttpError(409, `${r.no} is ${r.status.toLowerCase()}.`);
  const p = (req.body ?? {}) as { acknowledged?: boolean; asProprietor?: boolean };
  if (!p.acknowledged)
    throw new MockHttpError(422, 'Confirm you have checked the reason for the refund.');
  const overLimit = r.amount > ctx.fin.settings.refundLimit;
  if (overLimit && !p.asProprietor)
    throw new MockHttpError(
      403,
      `Refunds above ${naira(ctx.fin.settings.refundLimit)} need the Proprietor’s approval.`,
    );
  const proprietor =
    ctx.data.staff.find((s) => s.position === 'Proprietor')?.name ?? 'the Proprietor';
  r.status = 'Approved';
  r.approvedBy = overLimit ? `${proprietor} (recorded by ${ctx.actor})` : ctx.actor;
  r.approvedOn = isoToday();
  r.history.push(
    historyEntry(
      'Approved',
      overLimit
        ? `${proprietor} · recorded by ${ctx.actor}`
        : `${ctx.actor} · within ${naira(ctx.fin.settings.refundLimit)} limit`,
      'success',
    ),
  );
  ctx.log('finance', `${r.no} approved`, naira(r.amount));
  return refundDetail(ctx.refresh(), r);
});

mock.post('/v1/finance/refunds/:id/reject', (req) => {
  const ctx = finFor(req);
  const r = findRefund(ctx, req.params.id!);
  if (r.status !== 'Awaiting approval' && r.status !== 'Approved')
    throw new MockHttpError(409, `${r.no} is ${r.status.toLowerCase()}.`);
  const reason = requireText((req.body as { reason?: string })?.reason, 'Give a reason.');
  r.status = 'Rejected';
  r.rejectReason = reason;
  r.history.push(
    historyEntry(
      'Rejected',
      `${ctx.actor} · ${reason} · ${naira(r.amount)} stays as credit`,
      'error',
    ),
  );
  return refundDetail(ctx.refresh(), r);
});

mock.post('/v1/finance/refunds/:id/pay', (req) => {
  const ctx = finFor(req);
  const r = findRefund(ctx, req.params.id!);
  if (r.status !== 'Approved')
    throw new MockHttpError(409, 'Only an approved refund can be paid out.');
  const p = (req.body ?? {}) as { accountId?: string; date?: string; reference?: string };
  const account = ctx.fin.accounts.find((a) => a.id === p.accountId && a.status === 'Active');
  if (!account) throw new MockHttpError(422, 'Choose the account the refund is paid from.');
  const date = requireDate(p.date, 'Enter the date it was paid.');
  if (date > isoToday()) throw new MockHttpError(422, 'The date can’t be in the future.');
  const balance = ctx.ledger.accountBalance(account.id);
  if (balance < r.amount)
    throw new MockHttpError(422, `${account.name} only has ${naira(balance)}.`);
  r.status = 'Paid';
  r.paidOn = date;
  r.paidFrom = account.id;
  r.paidRef = (p.reference ?? '').trim();
  r.history.push(
    historyEntry(
      'Paid out',
      `${ctx.actor} · from ${account.name}${r.paidRef ? ` · ${r.paidRef}` : ''}`,
      'success',
    ),
  );
  ctx.log('finance', `${r.no} paid out`, `${naira(r.amount)} from ${account.name}`);
  const view = refundDetail(ctx.refresh(), r);
  refundPaid(ctx.schoolId, r, ctx.actor);
  return view;
});

export { branchNameOf };
