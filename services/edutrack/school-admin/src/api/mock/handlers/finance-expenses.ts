import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  ExpenseDetail,
  ExpenseList,
  ExpensePayload,
  ExpenseStatus,
  PayExpensePayload,
  PaymentMethod,
  VendorDetail,
  VendorPayload,
} from '@/types';

import { BANKS, nextId, nextNo, type ExpenseRec, type VendorRec } from '../finance-db';
import { isoToday, sum } from '../finance-ledger';
import { plural } from './academics-shared';
import {
  approvalSteps,
  branchScope,
  expenseRow,
  finFor,
  historyEntry,
  naira,
  nextApprover,
  requireDate,
  requireMoney,
  showHistory,
  vendorRow,
  type FinCtx,
} from './finance-shared';
import { EMAIL, isPhone, requireText } from './shared';

const EXPENSE_METHODS: PaymentMethod[] = ['Bank transfer', 'Cash', 'Cheque', 'POS', 'Other'];

function findExpense(ctx: FinCtx, id: string) {
  const e = ctx.fin.expenses.find((x) => x.id === id || x.no === id);
  if (!e) throw new MockHttpError(404, 'Expense not found');
  return e;
}

/* ---------------- Expenses ---------------- */

mock.get('/v1/finance/expenses', (req): ExpenseList => {
  const ctx = finFor(req);
  const q = req.query;
  const branchId = branchScope(ctx, q.branch);
  const scoped = ctx.fin.expenses.filter((e) => !branchId || e.branchId === branchId);
  const search = (q.search ?? '').trim().toLowerCase();
  const rows = scoped
    .filter((e) => !q.status || e.status === q.status)
    .filter((e) => !q.category || e.category === q.category)
    .filter((e) => !q.vendor || e.vendorId === q.vendor)
    .filter((e) => (!q.from || e.date >= q.from) && (!q.to || e.date <= q.to))
    .map((e) => expenseRow(ctx, e))
    .filter(
      (e) =>
        !search ||
        `${e.no} ${e.description} ${e.vendor ?? ''} ${e.category}`.toLowerCase().includes(search),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const counts = { All: scoped.length } as Record<ExpenseStatus | 'All', number>;
  for (const s of ['Draft', 'Submitted', 'Approved', 'Paid', 'Rejected'] as const)
    counts[s] = scoped.filter((e) => e.status === s).length;
  const paid = scoped.filter((e) => e.status === 'Paid');
  const pageSize = Number(q.pageSize ?? 25);
  const page = Math.max(1, Number(q.page ?? 1));
  const cats = new Map<string, number>();
  for (const e of paid) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    },
    summary: {
      paid: sum(paid.map((e) => e.amount)),
      approvedUnpaid: sum(scoped.filter((e) => e.status === 'Approved').map((e) => e.amount)),
      awaitingApproval: sum(scoped.filter((e) => e.status === 'Submitted').map((e) => e.amount)),
      awaitingCount: counts.Submitted,
      drafts: counts.Draft,
      counts,
      byCategory: [...cats]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    categories: ctx.fin.expenseCategories,
  };
});

export function expenseDetail(ctx: FinCtx, e: ExpenseRec): ExpenseDetail {
  const steps = approvalSteps(ctx.fin, e);
  const limit = naira(ctx.fin.settings.expenseLimit);
  return {
    ...expenseRow(ctx, e),
    branchId: e.branchId,
    method: e.method,
    accountId: e.accountId,
    account: ctx.fin.accounts.find((a) => a.id === e.accountId)?.name ?? null,
    paidOn: e.paidOn,
    paidRef: e.paidRef,
    attachment: e.attachment,
    rejectReason: e.rejectReason,
    notes: e.notes,
    steps: ['Bursar', 'Principal'].map((role) => {
      const a = e.approvals.find((x) => x.role === role);
      const needed = steps.includes(role);
      return {
        role,
        limit: role === 'Bursar' ? `Up to ${limit}` : `Above ${limit}`,
        by: a?.by ?? null,
        on: a?.on ?? null,
        status: !needed
          ? 'Not needed'
          : a
            ? 'Done'
            : e.status === 'Rejected'
              ? 'Rejected'
              : 'Waiting',
      };
    }),
    canApprove: e.status === 'Submitted',
    history: showHistory(e.history),
  };
}

mock.get('/v1/finance/expenses/:id', (req) => {
  const ctx = finFor(req);
  return expenseDetail(ctx, findExpense(ctx, req.params.id!));
});

function expensePayload(ctx: FinCtx, body: unknown): ExpensePayload {
  const p = (body ?? {}) as Partial<ExpensePayload>;
  const description = requireText(p.description, 'Describe what the money is for.');
  if (!ctx.fin.expenseCategories.includes(p.category ?? ''))
    throw new MockHttpError(422, 'Choose a category.');
  const amount = requireMoney(p.amount, 'Enter the amount in naira.');
  const date = requireDate(p.date, 'Enter the date of the expense.');
  if (date > isoToday()) throw new MockHttpError(422, 'The date can’t be in the future.');
  const vendorId = p.vendorId || null;
  if (vendorId && !ctx.fin.vendors.some((v) => v.id === vendorId && v.status === 'Active'))
    throw new MockHttpError(422, 'Choose an active vendor.');
  const branchId = ctx.data.branches.find((b) => b.id === p.branchId && b.status === 'Active')?.id;
  if (!branchId) throw new MockHttpError(422, 'Choose the branch.');
  const method = EXPENSE_METHODS.includes(p.method as PaymentMethod)
    ? (p.method as PaymentMethod)
    : 'Bank transfer';
  if (p.submit && amount > ctx.fin.settings.expenseLimit && !p.attachment && vendorId)
    throw new MockHttpError(
      422,
      `Attach the vendor’s invoice: expenses above ${naira(ctx.fin.settings.expenseLimit)} need one for the Principal.`,
    );
  return {
    date,
    category: p.category!,
    description,
    vendorId,
    branchId,
    amount,
    method,
    notes: (p.notes ?? '').trim(),
    attachment: p.attachment ?? null,
    submit: !!p.submit,
  };
}

function submit(ctx: FinCtx, e: ExpenseRec) {
  e.status = 'Submitted';
  if (!e.no) e.no = nextNo(ctx.fin, 'EXP', e.date.slice(0, 4));
  e.history.push(
    historyEntry(
      'Submitted for approval',
      `${ctx.actor} · needs ${approvalSteps(ctx.fin, e).join(' then ')}`,
    ),
  );
}

mock.post('/v1/finance/expenses', (req) => {
  const ctx = finFor(req);
  const p = expensePayload(ctx, req.body);
  const e: ExpenseRec = {
    id: nextId(ctx.fin, 'ex'),
    no: '',
    date: p.date,
    category: p.category,
    description: p.description,
    vendorId: p.vendorId,
    branchId: p.branchId,
    amount: p.amount,
    method: p.method,
    accountId: null,
    status: 'Draft',
    approvals: [],
    submittedBy: ctx.actor,
    paidOn: null,
    paidRef: '',
    attachment: p.attachment,
    rejectReason: '',
    notes: p.notes,
    history: [historyEntry('Saved as draft', ctx.actor, 'neutral')],
  };
  if (p.submit) submit(ctx, e);
  ctx.fin.expenses.push(e);
  ctx.log(
    'finance',
    `Expense ${p.submit ? 'submitted' : 'saved'}: ${e.description}`,
    naira(e.amount),
  );
  return expenseDetail(ctx, e);
});

mock.put('/v1/finance/expenses/:id', (req) => {
  const ctx = finFor(req);
  const e = findExpense(ctx, req.params.id!);
  if (e.status !== 'Draft' && e.status !== 'Rejected')
    throw new MockHttpError(409, 'Only drafts and rejected expenses can be edited.');
  const p = expensePayload(ctx, req.body);
  Object.assign(e, {
    date: p.date,
    category: p.category,
    description: p.description,
    vendorId: p.vendorId,
    branchId: p.branchId,
    amount: p.amount,
    method: p.method,
    notes: p.notes,
    attachment: p.attachment,
    approvals: [],
    rejectReason: '',
  });
  e.status = 'Draft';
  e.history.push(historyEntry('Edited', ctx.actor, 'neutral'));
  if (p.submit) submit(ctx, e);
  return expenseDetail(ctx, e);
});

mock.post('/v1/finance/expenses/:id/submit', (req) => {
  const ctx = finFor(req);
  const e = findExpense(ctx, req.params.id!);
  if (e.status !== 'Draft') throw new MockHttpError(409, 'Only a draft can be submitted.');
  submit(ctx, e);
  return expenseDetail(ctx, e);
});

mock.post('/v1/finance/expenses/:id/approve', (req) => {
  const ctx = finFor(req);
  const e = findExpense(ctx, req.params.id!);
  if (e.status !== 'Submitted')
    throw new MockHttpError(409, 'Only a submitted expense can be approved.');
  const role = nextApprover(ctx.fin, e)!;
  e.approvals.push({ role, by: ctx.actor, on: isoToday() });
  const next = nextApprover(ctx.fin, e);
  e.history.push(
    historyEntry(
      `Approved · ${role}`,
      `${ctx.actor}${next ? ` · now waiting for the ${next}` : ''}`,
      'success',
    ),
  );
  if (!next) e.status = 'Approved';
  ctx.log('finance', `Expense ${e.no} approved (${role})`, naira(e.amount));
  return expenseDetail(ctx, e);
});

mock.post('/v1/finance/expenses/:id/reject', (req) => {
  const ctx = finFor(req);
  const e = findExpense(ctx, req.params.id!);
  if (e.status !== 'Submitted' && e.status !== 'Approved')
    throw new MockHttpError(409, 'Only a submitted or approved expense can be rejected.');
  const reason = requireText(
    (req.body as { reason?: string })?.reason,
    'Say why, so it can be fixed and resubmitted.',
  );
  e.status = 'Rejected';
  e.rejectReason = reason;
  e.history.push(historyEntry('Rejected', `${ctx.actor} · ${reason}`, 'error'));
  return expenseDetail(ctx, e);
});

mock.post('/v1/finance/expenses/:id/pay', (req) => {
  const ctx = finFor(req);
  const e = findExpense(ctx, req.params.id!);
  if (e.status !== 'Approved')
    throw new MockHttpError(409, 'Only an approved expense can be paid.');
  const p = (req.body ?? {}) as Partial<PayExpensePayload>;
  const acc = ctx.fin.accounts.find((a) => a.id === p.accountId && a.status === 'Active');
  if (!acc) throw new MockHttpError(422, 'Choose the account it was paid from.');
  const date = requireDate(p.date, 'Enter the payment date.');
  if (date > isoToday()) throw new MockHttpError(422, 'The date can’t be in the future.');
  if (date < e.date) throw new MockHttpError(422, 'It can’t be paid before the expense date.');
  const bal = ctx.ledger.accountBalance(acc.id);
  if (bal < e.amount) throw new MockHttpError(422, `${acc.name} only has ${naira(bal)}.`);
  const reference = (p.reference ?? '').trim();
  if (acc.kind === 'Bank' && !reference)
    throw new MockHttpError(422, 'Enter the transfer or cheque reference.');
  Object.assign(e, {
    status: 'Paid',
    accountId: acc.id,
    paidOn: date,
    paidRef: reference || 'Cash voucher',
  });
  e.history.push(
    historyEntry(
      'Paid',
      `${ctx.actor} · from ${acc.name}${reference ? ` · ${reference}` : ''}`,
      'success',
    ),
  );
  ctx.log('finance', `Expense ${e.no} paid`, `${naira(e.amount)} from ${acc.name}`);
  return expenseDetail(ctx.refresh(), e);
});

mock.post('/v1/finance/expenses/categories', (req) => {
  const ctx = finFor(req);
  const name = requireText((req.body as { name?: string })?.name, 'Name the category.');
  if (ctx.fin.expenseCategories.some((c) => c.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, 'That category already exists.');
  ctx.fin.expenseCategories.push(name);
  return ctx.fin.expenseCategories;
});

/* ---------------- Vendors ---------------- */

mock.get('/v1/finance/vendors', (req) => {
  const ctx = finFor(req);
  const search = (req.query.search ?? '').trim().toLowerCase();
  const rows = ctx.fin.vendors
    .map((v) => vendorRow(ctx, v))
    .filter((v) => !req.query.status || v.status === req.query.status)
    .filter((v) => !req.query.category || v.category === req.query.category)
    .filter(
      (v) =>
        !search ||
        `${v.name} ${v.category} ${v.contactName} ${v.phone}`.toLowerCase().includes(search),
    )
    .sort((a, b) =>
      a.status === b.status
        ? b.paid + b.outstanding - (a.paid + a.outstanding)
        : a.status === 'Active'
          ? -1
          : 1,
    );
  return {
    rows,
    paid: sum(rows.map((v) => v.paid)),
    outstanding: sum(rows.map((v) => v.outstanding)),
    active: rows.filter((v) => v.status === 'Active').length,
    categories: [...new Set(ctx.fin.vendors.map((v) => v.category))].sort(),
    banks: BANKS,
  };
});

function findVendor(ctx: FinCtx, id: string) {
  const v = ctx.fin.vendors.find((x) => x.id === id);
  if (!v) throw new MockHttpError(404, 'Vendor not found');
  return v;
}

function vendorDetail(ctx: FinCtx, v: VendorRec): VendorDetail {
  return {
    ...vendorRow(ctx, v),
    address: v.address,
    notes: v.notes,
    rows: ctx.fin.expenses
      .filter((e) => e.vendorId === v.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => expenseRow(ctx, e)),
    history: showHistory(v.history),
  };
}

mock.get('/v1/finance/vendors/:id', (req) => {
  const ctx = finFor(req);
  return vendorDetail(ctx, findVendor(ctx, req.params.id!));
});

function vendorPayload(ctx: FinCtx, body: unknown, exceptId?: string): VendorPayload {
  const p = (body ?? {}) as Partial<VendorPayload>;
  const name = requireText(p.name, 'Enter the vendor’s name.');
  if (ctx.fin.vendors.some((v) => v.id !== exceptId && v.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, 'A vendor with that name already exists.');
  const category = requireText(p.category, 'Choose what they supply.');
  const phone = (p.phone ?? '').trim();
  if (phone && !isPhone(phone) && !/^0700\s?\d{3}\s?\d{4}$/.test(phone.replace(/\s/g, ' ')))
    throw new MockHttpError(422, 'Enter a valid Nigerian phone number.');
  const email = (p.email ?? '').trim();
  if (email && !EMAIL.test(email)) throw new MockHttpError(422, 'Enter a valid email address.');
  const bank = (p.bank ?? '').trim();
  const accountNumber = (p.accountNumber ?? '').replace(/\s/g, '');
  if (bank && bank !== 'Direct debit') {
    if (!BANKS.includes(bank)) throw new MockHttpError(422, 'Choose a bank from the list.');
    if (!/^\d{10}$/.test(accountNumber))
      throw new MockHttpError(422, 'NUBAN account numbers are 10 digits.');
  }
  return {
    name,
    category,
    contactName: (p.contactName ?? '').trim(),
    phone,
    email,
    address: (p.address ?? '').trim(),
    bank,
    accountNumber: bank === 'Direct debit' ? '' : accountNumber,
    accountName:
      bank && bank !== 'Direct debit' ? requireText(p.accountName, 'Enter the account name.') : '',
    notes: (p.notes ?? '').trim(),
  };
}

mock.post('/v1/finance/vendors', (req) => {
  const ctx = finFor(req);
  const v: VendorRec = {
    id: nextId(ctx.fin, 'v'),
    ...vendorPayload(ctx, req.body),
    status: 'Active',
    history: [historyEntry('Vendor added', ctx.actor)],
  };
  ctx.fin.vendors.push(v);
  ctx.log('finance', `Vendor added: ${v.name}`);
  return vendorDetail(ctx, v);
});

mock.put('/v1/finance/vendors/:id', (req) => {
  const ctx = finFor(req);
  const v = findVendor(ctx, req.params.id!);
  const p = vendorPayload(ctx, req.body, v.id);
  const bankChanged = p.bank !== v.bank || p.accountNumber !== v.accountNumber;
  Object.assign(v, p);
  v.history.push(
    historyEntry(
      bankChanged ? 'Bank details changed' : 'Details updated',
      ctx.actor,
      bankChanged ? 'warning' : 'info',
    ),
  );
  return vendorDetail(ctx, v);
});

mock.post('/v1/finance/vendors/:id/toggle', (req) => {
  const ctx = finFor(req);
  const v = findVendor(ctx, req.params.id!);
  if (v.status === 'Active') {
    const open = ctx.fin.expenses.filter(
      (e) => e.vendorId === v.id && (e.status === 'Submitted' || e.status === 'Approved'),
    );
    if (open.length)
      throw new MockHttpError(
        422,
        `${plural(open.length, 'expense')} for ${v.name} ${open.length === 1 ? 'is' : 'are'} still waiting to be paid.`,
      );
  }
  v.status = v.status === 'Active' ? 'Inactive' : 'Active';
  v.history.push(
    historyEntry(v.status === 'Active' ? 'Reactivated' : 'Deactivated', ctx.actor, 'neutral'),
  );
  return vendorDetail(ctx, v);
});
