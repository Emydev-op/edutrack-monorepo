import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AccountDetail,
  AccountsView,
  ExpenseDetail,
  FeesOverview,
  FeeStructureView,
  FinanceOverview,
  GeneratePreview,
  InvoiceDetail,
  InvoiceList,
  LoginResponse,
  PaymentDetail,
  PaymentList,
  RefundDetail,
  ReportView,
  SetupProgress,
  StatementView,
  StudentAccount,
  StudentDetail,
} from '@/types';

import { installMockApi } from '..';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: 'Edutrack2026!',
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}
async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return { status: e.response?.status, message: e.response?.data?.message as string };
  }
  throw new Error('Expected the request to fail');
}
const LONG = { timeout: 30000 };
const today = () => new Date().toISOString().slice(0, 10);

describe('Finance · Greenfield', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('computes the term from invoices and payments', LONG, async () => {
    const { data } = await api.get<FinanceOverview>('/v1/finance/overview', {
      params: { branch: 'All branches' },
    });
    expect(data.term.name).toBe('First Term');
    const list = await api.get<InvoiceList>('/v1/finance/invoices', { params: { pageSize: 5 } });
    const s = list.data.summary;
    expect(s.billed).toBe(s.collected + s.outstanding);
    expect(s.rate).toBeGreaterThan(55);
    expect(list.data.meta.total).toBeGreaterThan(1100);
    expect(data.sections.map((x) => x.section)).toContain('Junior Secondary');
    expect(data.monthly.length).toBeGreaterThan(2);
  });

  it('keeps student balances equal to the ledger', async () => {
    const acc = await api.get<StudentAccount>('/v1/finance/students/emmanuel');
    expect(acc.data.outstanding).toBe(95000);
    expect(acc.data.invoices.map((i) => i.no)).toEqual(['INV-2026-0418', 'INV-2025-1187']);
    const stu = await api.get<StudentDetail>('/v1/students/emmanuel');
    expect(stu.data.balance).toBe(95000);
    expect(stu.data.invoices[0]).toMatchObject({ number: 'INV-2026-0418', balance: 80000 });
  });

  it('allocates a payment to the oldest balance first', LONG, async () => {
    const { data } = await api.post<PaymentDetail>('/v1/finance/payments', {
      studentKey: 'emmanuel',
      amount: 50000,
      date: today(),
      method: 'Cash',
      accountId: 'acc-cash-mc',
      reference: '',
      payer: '',
      note: '',
      allocations: [],
      matched: false,
    });
    expect(data.status).toBe('Confirmed');
    expect(data.allocations.map((a) => [a.no, a.amount])).toEqual([
      ['INV-2025-1187', 15000],
      ['INV-2026-0418', 35000],
    ]);
    expect((await api.get<StudentDetail>('/v1/students/emmanuel')).data.balance).toBe(45000);
  });

  it('holds transfers as pending until verified, and rejects duplicates', LONG, async () => {
    const body = {
      studentKey: 'daniel',
      amount: 100000,
      date: today(),
      method: 'Bank transfer',
      accountId: 'acc-gtb',
      reference: 'GTB/TEST/0001',
      payer: '',
      note: '',
      allocations: [],
      matched: false,
    };
    const { data: p } = await api.post<PaymentDetail>('/v1/finance/payments', body);
    expect(p.status).toBe('Pending verification');
    expect(p.balanceNow).toBe(185000);
    expect((await failure(api.post('/v1/finance/payments', body))).message).toMatch(/already on/);
    const v = await api.post<PaymentDetail>(`/v1/finance/payments/${p.id}/verify`);
    expect(v.data.balanceNow).toBe(85000);
  });

  it('turns an overpayment into credit, then refunds it with approval', LONG, async () => {
    const { data: p } = await api.post<PaymentDetail>('/v1/finance/payments', {
      studentKey: 'favour',
      amount: 20000,
      date: today(),
      method: 'POS',
      accountId: 'acc-gtb',
      reference: 'POS-TEST-1',
      payer: '',
      note: '',
      allocations: [],
      matched: false,
    });
    expect(p.unallocated).toBe(20000);
    expect(p.studentCredit).toBe(20000);
    const tooMuch = await failure(
      api.post('/v1/finance/refunds', {
        studentKey: 'favour',
        paymentId: p.id,
        amount: 25000,
        reason: 'Paid twice',
        payTo: 'GTBank ****1100',
      }),
    );
    expect(tooMuch.message).toMatch(/Only ₦20,000/);
    const { data: r } = await api.post<RefundDetail>('/v1/finance/refunds', {
      studentKey: 'favour',
      paymentId: p.id,
      amount: 20000,
      reason: 'Paid twice',
      payTo: 'GTBank ****1100 · Chukwudi Okeke',
    });
    expect(r.status).toBe('Awaiting approval');
    expect((await failure(api.post(`/v1/finance/refunds/${r.id}/approve`, {}))).message).toMatch(
      /checked/,
    );
    await api.post(`/v1/finance/refunds/${r.id}/approve`, { acknowledged: true });
    const before = (await api.get<AccountsView>('/v1/finance/accounts')).data.rows.find(
      (a) => a.id === 'acc-gtb',
    )!.balance;
    const paid = await api.post<RefundDetail>(`/v1/finance/refunds/${r.id}/pay`, {
      accountId: 'acc-gtb',
      date: today(),
      reference: 'RFD-TEST',
    });
    expect(paid.data.status).toBe('Paid');
    const after = (await api.get<AccountsView>('/v1/finance/accounts')).data.rows.find(
      (a) => a.id === 'acc-gtb',
    )!.balance;
    expect(before - after).toBe(20000);
    expect((await api.get<StudentAccount>('/v1/finance/students/favour')).data.credit).toBe(0);
  });

  it('matches a bank statement to pending transfers', LONG, async () => {
    const pending = await api.get<PaymentList>('/v1/finance/payments', {
      params: { tab: 'pending' },
    });
    expect(pending.data.summary.pendingCount).toBeGreaterThan(3);
    const sample = await api.get<{ fileName: string; text: string }>(
      '/v1/finance/accounts/acc-gtb/sample-statement',
    );
    const { data: st } = await api.post<StatementView>(
      '/v1/finance/accounts/acc-gtb/statements',
      sample.data,
    );
    const matched = st.rows.filter((r) => r.match === 'Matched');
    expect(matched.length).toBeGreaterThan(1);
    expect(st.rows.some((r) => r.match === 'Possible match')).toBe(true);
    expect(st.rows.some((r) => r.match === 'No match' && r.credit === 75000)).toBe(true);
    const done = await api.post<StatementView>(`/v1/finance/statements/${st.id}/confirm`, {
      lineIds: matched.map((m) => m.id),
    });
    expect(done.data.rows.filter((r) => r.match === 'Confirmed')).toHaveLength(matched.length);
    const after = await api.get<PaymentList>('/v1/finance/payments', {
      params: { tab: 'pending' },
    });
    expect(after.data.summary.pendingCount).toBe(
      pending.data.summary.pendingCount - matched.length,
    );
  });

  it('edits an invoice: optional item, concession, cancel to credit', LONG, async () => {
    const { data: inv } = await api.get<InvoiceDetail>('/v1/finance/invoices/INV-2026-0418');
    const bus = inv.optionalAvailable.find((o) => o.name === 'School bus')!;
    const added = await api.post<InvoiceDetail>(`/v1/finance/invoices/${inv.id}/lines`, {
      itemId: bus.itemId,
    });
    expect(added.data.total).toBe(inv.total + bus.amount);
    const special = inv.discountsAvailable.find((d) => d.name === 'Special concession')!;
    expect(
      (
        await failure(
          api.post(`/v1/finance/invoices/${inv.id}/discounts`, {
            discountId: special.id,
            amount: 5000,
          }),
        )
      ).message,
    ).toMatch(/reason/);
    const disc = await api.post<InvoiceDetail>(`/v1/finance/invoices/${inv.id}/discounts`, {
      discountId: special.id,
      amount: 5000,
      reason: 'Hardship',
    });
    expect(disc.data.total).toBe(inv.total + bus.amount - 5000);

    const other = (await api.get<InvoiceDetail>('/v1/finance/invoices/INV-2026-0721')).data;
    expect(other.status).toBe('Paid');
    const cancelled = await api.post<InvoiceDetail>(`/v1/finance/invoices/${other.id}/cancel`, {
      reason: 'Issued in error',
    });
    expect(cancelled.data).toMatchObject({ status: 'Cancelled', balance: 0, credit: other.paid });
  });

  it('copies First Term fees to Second Term and generates drafts', LONG, async () => {
    const opts = await api.get<FeesOverview>('/v1/finance/fees');
    const second = opts.data.structures.find(
      (s) => s.term === 'Second Term' && s.branchId === 'mc',
    )!;
    expect(second.status).toBe('Not created');
    const copied = await api.post<FeeStructureView>('/v1/finance/fees/structure/copy', {
      fromTermId: 't-2026-1',
      toTermId: second.termId,
      allBranches: true,
    });
    expect(copied.data.status).toBe('Draft');
    const draftPreview = await api.post<GeneratePreview>('/v1/finance/invoices/generate/preview', {
      termId: second.termId,
      issue: false,
    });
    expect(draftPreview.data.toCreate).toBe(0);
    for (const b of ['mc', 'lk'])
      await api.post('/v1/finance/fees/structure/publish', { termId: second.termId, branchId: b });
    const { data: pv } = await api.post<GeneratePreview>('/v1/finance/invoices/generate/preview', {
      termId: second.termId,
      levels: ['JSS 2'],
      issue: false,
    });
    expect(pv.toCreate).toBeGreaterThan(40);
    expect(pv.total).toBeGreaterThan(pv.toCreate * 150000);
    const made = await api.post('/v1/finance/invoices/generate', {
      termId: second.termId,
      levels: ['JSS 2'],
      issue: false,
    });
    expect(made.data.created).toBe(pv.toCreate);
    const drafts = await api.get<InvoiceList>('/v1/finance/invoices', {
      params: { term: second.termId, status: 'Draft', pageSize: 100 },
    });
    expect(drafts.data.meta.total).toBe(pv.toCreate);
    // Drafts don't count as billed until they're issued.
    expect(drafts.data.summary.billed).toBe(0);
    const issued = await api.post('/v1/finance/invoices/issue', {
      ids: drafts.data.data.slice(0, 3).map((d) => d.id),
    });
    expect(issued.data.issued).toBe(3);
  });

  it('routes big expenses through the Bursar and the Principal', LONG, async () => {
    const { data: e } = await api.post<ExpenseDetail>('/v1/finance/expenses', {
      date: today(),
      category: 'Maintenance',
      description: 'Roof repairs · Block B',
      vendorId: 'v-okon',
      branchId: 'mc',
      amount: 420000,
      method: 'Bank transfer',
      notes: '',
      attachment: { name: 'okon-quote.pdf', size: '210 KB' },
      submit: true,
    });
    expect(e).toMatchObject({ status: 'Submitted', waitingOn: 'Bursar' });
    const one = await api.post<ExpenseDetail>(`/v1/finance/expenses/${e.id}/approve`);
    expect(one.data).toMatchObject({ status: 'Submitted', waitingOn: 'Principal' });
    const two = await api.post<ExpenseDetail>(`/v1/finance/expenses/${e.id}/approve`);
    expect(two.data.status).toBe('Approved');
    const paid = await api.post<ExpenseDetail>(`/v1/finance/expenses/${e.id}/pay`, {
      accountId: 'acc-ops',
      date: today(),
      reference: 'ACC/OUT/TEST',
    });
    expect(paid.data.status).toBe('Paid');
    const acc = await api.get<AccountDetail>('/v1/finance/accounts/acc-ops', {
      params: { pageSize: 1 },
    });
    expect(acc.data.ledger.data[0]).toMatchObject({ kind: 'Expense', moneyOut: 420000 });
  });

  it('reports outstanding balances by age', async () => {
    const { data } = await api.get<ReportView>('/v1/finance/reports/outstanding');
    expect(data.rows.length).toBeGreaterThan(50);
    const t = data.totals!;
    expect(
      (t.current as number) +
        (t.d30 as number) +
        (t.d60 as number) +
        (t.d90 as number) +
        (t.older as number),
    ).toBe(t.total);
  });

  it('completes the Setup Center Fees step', async () => {
    await api.post('/v1/setup/steps/fees/complete');
    const { data } = await api.get<SetupProgress>('/v1/setup');
    expect(data.steps.find((s) => s.id === 'fees')).toMatchObject({ done: true, auto: true });
  });
});

describe('Finance · Crestview onboarding', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('e.udo@crestviewcollege.ng');
  });

  it('starts empty and needs the academic setup first', async () => {
    const { data } = await api.get<FeesOverview>('/v1/finance/fees');
    expect(data.started).toBe(false);
    const accounts = await api.get<AccountsView>('/v1/finance/accounts');
    expect(accounts.data.rows).toEqual([]);
    expect(accounts.data.notices[0]?.title).toMatch(/shown to parents/);
    expect((await failure(api.post('/v1/setup/steps/fees/complete'))).message).toMatch(/fee items/);
  });

  it('adds the bank account parents pay into', async () => {
    expect(
      (
        await failure(
          api.post('/v1/finance/accounts', {
            name: 'Fees',
            kind: 'Bank',
            bank: 'GTBank',
            accountNumber: '12345',
            accountName: 'Crestview',
          }),
        )
      ).message,
    ).toMatch(/10 digits/);
    const { data } = await api.post('/v1/finance/accounts', {
      name: 'Fees collection',
      kind: 'Bank',
      bank: 'Zenith Bank',
      accountNumber: '1012345678',
      accountName: 'Crestview College Ltd',
      branchId: null,
      showToParents: true,
      openingBalance: 0,
      openingDate: today(),
    });
    expect(data).toMatchObject({ showToParents: true, balance: 0 });
  });
});
