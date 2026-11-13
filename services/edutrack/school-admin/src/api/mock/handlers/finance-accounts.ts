import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  AccountDetail,
  AccountPayload,
  AccountsView,
  AccountTransferPayload,
  BankAccountRow,
  LedgerRow,
  StatementLine,
  StatementSummary,
  StatementView,
} from '@/types';

import {
  BANKS,
  nextId,
  nextNo,
  type AccountRec,
  type StatementLineRec,
  type StatementRec,
} from '../finance-db';
import { accountMovements, last, addDays, daysBetween, isoToday, sum } from '../finance-ledger';
import { fmtDate, plural } from './academics-shared';
import {
  branchNameOf,
  finFor,
  historyEntry,
  naira,
  requireDate,
  requireMoney,
  type FinCtx,
} from './finance-shared';
import { requireText } from './shared';
import { parseCsv } from './staff';

const r = routesPath.finance;

function findAccount(ctx: FinCtx, id: string) {
  const a = ctx.fin.accounts.find((x) => x.id === id);
  if (!a) throw new MockHttpError(404, 'Account not found');
  return a;
}

function accountRow(ctx: FinCtx, a: AccountRec): BankAccountRow {
  const moves = accountMovements(ctx.fin, a);
  const monthStart = `${isoToday().slice(0, 7)}-01`;
  const thisMonth = moves.filter((m) => m.date >= monthStart && m.kind !== 'Opening balance');
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    bank: a.bank,
    accountNumber: a.accountNumber,
    accountName: a.accountName,
    branchId: a.branchId,
    branch: branchNameOf(ctx, a.branchId),
    showToParents: a.showToParents,
    status: a.status,
    balance: ctx.ledger.accountBalance(a.id),
    moneyIn: sum(thisMonth.map((m) => m.moneyIn)),
    moneyOut: sum(thisMonth.map((m) => m.moneyOut)),
    pending: ctx.ledger.accountPending(a.id),
    lastActivity: last(moves.filter((m) => m.kind !== 'Opening balance'))?.date ?? null,
    lastStatement:
      last(
        ctx.fin.statements
          .filter((s) => s.accountId === a.id)
          .map((s) => s.uploadedOn)
          .sort(),
      ) ?? null,
  };
}

mock.get('/v1/finance/accounts', (req): AccountsView => {
  const ctx = finFor(req);
  const rows = ctx.fin.accounts.map((a) => accountRow(ctx, a));
  const active = rows.filter((x) => x.status === 'Active');
  const notices: AccountsView['notices'] = [];
  const pending = sum(active.map((x) => x.pending));
  if (!active.some((x) => x.showToParents))
    notices.push({
      tone: 'warning',
      title: 'No account is shown to parents',
      description:
        'Invoices and payment reminders need bank details for parents to pay into. Mark a bank account “Shown to parents”.',
    });
  if (pending)
    notices.push({
      tone: 'info',
      title: `${naira(pending)} in transfers waiting for verification`,
      description:
        'Upload the account’s bank statement to match them automatically, or verify them one by one.',
      action: {
        label: 'Verify payments',
        to: { name: r.payments.name, query: { tab: 'pending' } },
      },
    });
  const branchesWithout = ctx.data.branches
    .filter(
      (b) =>
        b.status === 'Active' &&
        !active.some((x) => x.showToParents && (x.branchId === b.id || !x.branchId)),
    )
    .map((b) => b.name);
  if (active.some((x) => x.showToParents) && branchesWithout.length)
    notices.push({
      tone: 'info',
      title: `${branchesWithout.join(', ')} ${branchesWithout.length === 1 ? 'uses' : 'use'} another branch’s account`,
      description:
        'Parents there see the first account shown to parents. Add a branch account if fees are banked separately.',
    });
  return {
    rows,
    total: sum(active.map((x) => x.balance)),
    bankTotal: sum(active.filter((x) => x.kind === 'Bank').map((x) => x.balance)),
    cashTotal: sum(active.filter((x) => x.kind === 'Cash').map((x) => x.balance)),
    pending,
    notices,
    banks: BANKS,
  };
});

function accountPayload(ctx: FinCtx, body: unknown, exceptId?: string): AccountPayload {
  const p = (body ?? {}) as Partial<AccountPayload>;
  const name = requireText(p.name, 'Name the account, e.g. “Fees collection · Main Campus”.');
  if (
    ctx.fin.accounts.some((a) => a.id !== exceptId && a.name.toLowerCase() === name.toLowerCase())
  )
    throw new MockHttpError(422, 'Another account already has that name.');
  const kind = p.kind === 'Cash' ? 'Cash' : 'Bank';
  let bank = '';
  let accountNumber = '';
  let accountName = '';
  if (kind === 'Bank') {
    bank = requireText(p.bank, 'Choose the bank.');
    if (!BANKS.includes(bank)) throw new MockHttpError(422, 'Choose a bank from the list.');
    accountNumber = (p.accountNumber ?? '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(accountNumber))
      throw new MockHttpError(422, 'NUBAN account numbers are 10 digits.');
    if (
      ctx.fin.accounts.some(
        (a) => a.id !== exceptId && a.bank === bank && a.accountNumber === accountNumber,
      )
    )
      throw new MockHttpError(422, 'That account is already added.');
    accountName = requireText(
      p.accountName,
      'Enter the account name exactly as the bank shows it.',
    );
  }
  const branchId = p.branchId
    ? (ctx.data.branches.find((b) => b.id === p.branchId)?.id ?? null)
    : null;
  if (p.showToParents && kind === 'Cash')
    throw new MockHttpError(422, 'Only a bank account can be shown to parents.');
  const openingBalance = requireMoney(
    p.openingBalance ?? 0,
    'Enter the opening balance in naira.',
    { allowZero: true },
  );
  const openingDate = requireDate(
    p.openingDate ?? isoToday(),
    'Enter the date of the opening balance.',
  );
  if (openingDate > isoToday())
    throw new MockHttpError(422, 'The opening balance date can’t be in the future.');
  return {
    name,
    kind,
    bank,
    accountNumber,
    accountName,
    branchId,
    showToParents: !!p.showToParents,
    openingBalance,
    openingDate,
  };
}

/** One parent-facing account per branch (or one school-wide). */
function claimParents(ctx: FinCtx, a: AccountRec) {
  if (!a.showToParents) return;
  for (const o of ctx.fin.accounts)
    if (o.id !== a.id && o.showToParents && o.branchId === a.branchId) o.showToParents = false;
}

mock.post('/v1/finance/accounts', (req) => {
  const ctx = finFor(req);
  const p = accountPayload(ctx, req.body);
  const a: AccountRec = { id: nextId(ctx.fin, 'acc'), ...p, status: 'Active' };
  ctx.fin.accounts.push(a);
  claimParents(ctx, a);
  ctx.log(
    'finance',
    `Account added: ${a.name}`,
    a.kind === 'Bank' ? `${a.bank} ${a.accountNumber}` : 'Cash',
  );
  return accountRow(ctx.refresh(), a);
});

mock.put('/v1/finance/accounts/:id', (req) => {
  const ctx = finFor(req);
  const a = findAccount(ctx, req.params.id!);
  const p = accountPayload(ctx, req.body, a.id);
  const used = accountMovements(ctx.fin, a).length > 1;
  if (used && p.kind !== a.kind)
    throw new MockHttpError(
      422,
      'An account with transactions can’t change between bank and cash.',
    );
  Object.assign(a, p);
  claimParents(ctx, a);
  ctx.log('finance', `Account updated: ${a.name}`);
  return accountRow(ctx.refresh(), a);
});

mock.post('/v1/finance/accounts/:id/toggle', (req) => {
  const ctx = finFor(req);
  const a = findAccount(ctx, req.params.id!);
  if (a.status === 'Active') {
    const bal = ctx.ledger.accountBalance(a.id);
    if (bal !== 0)
      throw new MockHttpError(
        422,
        `Move the ${naira(bal)} balance to another account before deactivating.`,
      );
    if (ctx.ledger.accountPending(a.id))
      throw new MockHttpError(422, 'Verify or reject the transfers waiting on this account first.');
    a.status = 'Inactive';
    a.showToParents = false;
  } else a.status = 'Active';
  ctx.log('finance', `Account ${a.status === 'Active' ? 'reactivated' : 'deactivated'}: ${a.name}`);
  return accountRow(ctx.refresh(), a);
});

mock.get('/v1/finance/accounts/:id', (req): AccountDetail => {
  const ctx = finFor(req);
  const a = findAccount(ctx, req.params.id!);
  const q = req.query;
  let bal = 0;
  const rows: LedgerRow[] = accountMovements(ctx.fin, a).map((m) => ({
    id: m.id,
    date: m.date,
    kind: m.kind,
    ref: m.ref,
    description: m.description,
    moneyIn: m.moneyIn,
    moneyOut: m.moneyOut,
    balance: (bal += m.moneyIn - m.moneyOut),
    to: !m.link
      ? null
      : m.link.type === 'payment'
        ? { name: r.paymentDetail.name, params: { id: m.link.id } }
        : m.link.type === 'expense'
          ? { name: r.expenseDetail.name, params: { id: m.link.id } }
          : m.link.type === 'refund'
            ? { name: r.refundDetail.name, params: { id: m.link.id } }
            : null,
  }));
  const search = (q.search ?? '').toLowerCase();
  const filtered = rows
    .filter((x) => (!q.from || x.date >= q.from) && (!q.to || x.date <= q.to))
    .filter((x) => !q.kind || x.kind.startsWith(q.kind))
    .filter((x) => !search || `${x.ref} ${x.description}`.toLowerCase().includes(search))
    .reverse();
  const pageSize = Number(q.pageSize ?? 25);
  const page = Math.max(1, Number(q.page ?? 1));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [ty, tm] = isoToday().split('-').map(Number) as [number, number];
  const months = [3, 2, 1, 0].map((back) => {
    const idx = ty * 12 + (tm - 1) - back;
    const ym = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    const m = rows.filter((x) => x.date.startsWith(ym) && x.kind !== 'Opening balance');
    return {
      label: MON[idx % 12]!,
      moneyIn: sum(m.map((x) => x.moneyIn)),
      moneyOut: sum(m.map((x) => x.moneyOut)),
    };
  });

  return {
    ...accountRow(ctx, a),
    openingBalance: a.openingBalance,
    openingDate: a.openingDate,
    ledger: {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
    },
    statements: ctx.fin.statements
      .filter((s) => s.accountId === a.id)
      .map(statementSummary)
      .reverse(),
    monthly: months,
  };
});

/* ---------------- Transfers ---------------- */

mock.post('/v1/finance/transfers', (req) => {
  const ctx = finFor(req);
  const p = (req.body ?? {}) as Partial<AccountTransferPayload>;
  const from = ctx.fin.accounts.find((a) => a.id === p.fromId && a.status === 'Active');
  const to = ctx.fin.accounts.find((a) => a.id === p.toId && a.status === 'Active');
  if (!from || !to) throw new MockHttpError(422, 'Choose both accounts.');
  if (from.id === to.id) throw new MockHttpError(422, 'Choose two different accounts.');
  const amount = requireMoney(p.amount, 'Enter the amount moved.');
  const date = requireDate(p.date, 'Enter the date.');
  if (date > isoToday()) throw new MockHttpError(422, 'The date can’t be in the future.');
  const bal = ctx.ledger.accountBalance(from.id, date);
  if (amount > bal)
    throw new MockHttpError(422, `${from.name} only had ${naira(bal)} on ${fmtDate(date)}.`);
  const t = {
    id: nextId(ctx.fin, 'tr'),
    no: nextNo(ctx.fin, 'TRF', date.slice(0, 4)),
    date,
    fromId: from.id,
    toId: to.id,
    amount,
    reference: (p.reference ?? '').trim(),
    note: (p.note ?? '').trim(),
    by: ctx.actor,
  };
  ctx.fin.transfers.push(t);
  ctx.log('finance', `${naira(amount)} moved from ${from.name} to ${to.name}`, t.no);
  ctx.refresh();
  return { id: t.id, no: t.no };
});

/* ---------------- Bank statements ---------------- */

function statementSummary(s: StatementRec): StatementSummary {
  return {
    id: s.id,
    fileName: s.fileName,
    uploadedOn: s.uploadedOn,
    uploadedBy: s.uploadedBy,
    lines: s.lines.length,
    matched: s.lines.filter((l) => l.match === 'Matched' || l.match === 'Possible match').length,
    confirmed: s.lines.filter((l) => l.match === 'Confirmed' || l.match === 'Already recorded')
      .length,
    unmatched: s.lines.filter((l) => l.match === 'No match').length,
  };
}

function statementView(ctx: FinCtx, s: StatementRec): StatementView {
  const acc = findAccount(ctx, s.accountId);
  const pay = (id: string | null) => ctx.fin.payments.find((p) => p.id === id);
  return {
    ...statementSummary(s),
    accountId: acc.id,
    account: acc.name,
    rows: s.lines.map((l): StatementLine => {
      const p = pay(l.paymentId);
      return {
        ...l,
        paymentNo: p?.no ?? null,
        student: p ? (ctx.students.get(p.studentKey)?.name ?? null) : null,
      };
    }),
    pendingInAccount: ctx.fin.payments
      .filter(
        (p) =>
          p.status === 'Pending verification' && (p.accountId === acc.id || acc.kind === 'Bank'),
      )
      .map((p) => ({
        id: p.id,
        no: p.no,
        student: ctx.students.get(p.studentKey)?.name ?? '',
        amount: p.amount,
        date: p.date,
        reference: p.reference,
      })),
  };
}

const num = (v: string | undefined) => {
  const n = Number((v ?? '').replace(/[₦,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
};
const parseDate = (v: string) => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** Matches each statement line to a payment, expense or transfer already in EduTrack. */
function matchLines(
  ctx: FinCtx,
  acc: AccountRec,
  raw: Omit<StatementLineRec, 'match' | 'paymentId' | 'note'>[],
) {
  const taken = new Set<string>();
  const pending = ctx.fin.payments.filter((p) => p.status === 'Pending verification');
  const confirmed = ctx.fin.payments.filter(
    (p) => p.status === 'Confirmed' && p.accountId === acc.id,
  );
  return raw.map((l): StatementLineRec => {
    const text = `${l.description} ${l.reference}`.toUpperCase();
    const mentions = (p: { reference: string; studentKey: string }) => {
      const s = ctx.students.get(p.studentKey);
      return (
        (!!p.reference && text.includes(p.reference.toUpperCase())) ||
        (!!s && text.includes(s.admissionNo.toUpperCase()))
      );
    };
    if (l.credit) {
      const known = confirmed.find(
        (p) => !taken.has(p.id) && p.amount === l.credit && (mentions(p) || p.date === l.date),
      );
      if (known) {
        taken.add(known.id);
        return {
          ...l,
          match: 'Already recorded',
          paymentId: known.id,
          note: `${known.no} is already confirmed`,
        };
      }
      const sure = pending.find((p) => !taken.has(p.id) && p.amount === l.credit && mentions(p));
      if (sure) {
        taken.add(sure.id);
        return { ...l, match: 'Matched', paymentId: sure.id, note: 'Same amount and reference' };
      }
      const maybe = pending.find(
        (p) =>
          !taken.has(p.id) && p.amount === l.credit && Math.abs(daysBetween(p.date, l.date)) <= 5,
      );
      if (maybe) {
        taken.add(maybe.id);
        return {
          ...l,
          match: 'Possible match',
          paymentId: maybe.id,
          note: 'Same amount within 5 days; reference not found',
        };
      }
      return {
        ...l,
        match: 'No match',
        paymentId: null,
        note: 'No payment recorded for this credit',
      };
    }
    const spent = ctx.fin.expenses.some(
      (e) =>
        e.accountId === acc.id &&
        e.amount === l.debit &&
        e.paidOn &&
        Math.abs(daysBetween(e.paidOn, l.date)) <= 3,
    );
    const moved = ctx.fin.transfers.some(
      (t) =>
        t.fromId === acc.id && t.amount === l.debit && Math.abs(daysBetween(t.date, l.date)) <= 3,
    );
    const refunded = ctx.fin.refunds.some(
      (x) =>
        x.paidFrom === acc.id &&
        x.amount === l.debit &&
        x.paidOn &&
        Math.abs(daysBetween(x.paidOn, l.date)) <= 3,
    );
    return spent || moved || refunded
      ? {
          ...l,
          match: 'Already recorded',
          paymentId: null,
          note: spent
            ? 'Matches a paid expense'
            : moved
              ? 'Matches a transfer'
              : 'Matches a refund',
        }
      : { ...l, match: 'No match', paymentId: null, note: 'Money out not recorded in EduTrack' };
  });
}

mock.post('/v1/finance/accounts/:id/statements', (req) => {
  const ctx = finFor(req);
  const acc = findAccount(ctx, req.params.id!);
  if (acc.kind !== 'Bank') throw new MockHttpError(422, 'Statements are for bank accounts.');
  const p = (req.body ?? {}) as { fileName?: string; text?: string };
  const rows = parseCsv(p.text ?? '');
  if (rows.length < 2)
    throw new MockHttpError(
      422,
      'The file has no transactions. Export the statement as CSV with a header row.',
    );
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ci = {
    date: col('date'),
    desc: col('description', 'narration', 'details', 'remarks'),
    ref: col('reference', 'ref'),
    credit: col('credit', 'deposit', 'money in'),
    debit: col('debit', 'withdrawal', 'money out'),
  };
  if (ci.date < 0 || ci.credit < 0 || (ci.desc < 0 && ci.ref < 0))
    throw new MockHttpError(
      422,
      'Couldn’t find the Date, Description and Credit columns. Use the bank’s CSV export or the sample statement layout.',
    );
  const bad: number[] = [];
  const lines = rows.slice(1).flatMap((row, i) => {
    const date = parseDate(row[ci.date] ?? '');
    if (!date) {
      bad.push(i + 2);
      return [];
    }
    const credit = num(row[ci.credit]);
    const debit = ci.debit >= 0 ? num(row[ci.debit]) : 0;
    if (!credit && !debit) return [];
    return [
      {
        id: `sl${i + 1}`,
        date,
        description: (row[ci.desc] ?? '').trim(),
        reference: ci.ref >= 0 ? (row[ci.ref] ?? '').trim() : '',
        credit,
        debit,
      },
    ];
  });
  if (!lines.length)
    throw new MockHttpError(
      422,
      `No transactions could be read${bad.length ? ` (bad dates on rows ${bad.slice(0, 5).join(', ')})` : ''}.`,
    );
  const st: StatementRec = {
    id: nextId(ctx.fin, 'st'),
    accountId: acc.id,
    fileName: (p.fileName ?? 'statement.csv').trim(),
    uploadedOn: isoToday(),
    uploadedBy: ctx.actor,
    lines: matchLines(ctx, acc, lines),
  };
  ctx.fin.statements.push(st);
  const s = statementSummary(st);
  ctx.log(
    'finance',
    `Statement uploaded for ${acc.name}`,
    `${plural(s.lines, 'line')} · ${s.matched} matched`,
  );
  return statementView(ctx, st);
});

function findStatement(ctx: FinCtx, id: string) {
  const s = ctx.fin.statements.find((x) => x.id === id);
  if (!s) throw new MockHttpError(404, 'Statement not found');
  return s;
}

mock.get('/v1/finance/statements/:id', (req) => {
  const ctx = finFor(req);
  return statementView(ctx, findStatement(ctx, req.params.id!));
});

mock.put('/v1/finance/statements/:id/lines/:lineId', (req) => {
  const ctx = finFor(req);
  const st = findStatement(ctx, req.params.id!);
  const line = st.lines.find((l) => l.id === req.params.lineId);
  if (!line) throw new MockHttpError(404, 'Line not found');
  if (line.match === 'Confirmed' || line.match === 'Already recorded')
    throw new MockHttpError(409, 'This line is already recorded.');
  const p = (req.body ?? {}) as { paymentId?: string | null; ignore?: boolean };
  if (p.ignore) {
    Object.assign(line, { match: 'Ignored', paymentId: null, note: `Ignored by ${ctx.actor}` });
  } else if (p.paymentId) {
    const pay = ctx.fin.payments.find(
      (x) => x.id === p.paymentId && x.status === 'Pending verification',
    );
    if (!pay) throw new MockHttpError(422, 'Choose a payment waiting for verification.');
    if (pay.amount !== line.credit)
      throw new MockHttpError(
        422,
        `${pay.no} is ${naira(pay.amount)}, but this line is ${naira(line.credit)}.`,
      );
    for (const other of st.lines)
      if (other !== line && other.paymentId === pay.id && other.match !== 'Confirmed')
        Object.assign(other, { match: 'No match', paymentId: null, note: 'Unlinked' });
    Object.assign(line, { match: 'Matched', paymentId: pay.id, note: `Matched by ${ctx.actor}` });
  } else Object.assign(line, { match: 'No match', paymentId: null, note: 'Unlinked' });
  return statementView(ctx, st);
});

mock.post('/v1/finance/statements/:id/confirm', (req) => {
  const ctx = finFor(req);
  const st = findStatement(ctx, req.params.id!);
  const ids = ((req.body as { lineIds?: string[] })?.lineIds ?? []) as string[];
  const lines = st.lines.filter(
    (l) =>
      (l.match === 'Matched' || l.match === 'Possible match') &&
      l.paymentId &&
      (!ids.length || ids.includes(l.id)),
  );
  if (!lines.length) throw new MockHttpError(422, 'There are no matched lines to confirm.');
  let total = 0;
  for (const l of lines) {
    const p = ctx.fin.payments.find((x) => x.id === l.paymentId)!;
    if (p.status !== 'Pending verification') continue;
    p.accountId = st.accountId;
    p.status = 'Confirmed';
    p.verifiedBy = ctx.actor;
    p.verifiedOn = isoToday();
    p.history.push(
      historyEntry(
        'Verified',
        `${ctx.actor} · matched on ${st.fileName} (${fmtDate(l.date)})`,
        'success',
      ),
    );
    for (const a of p.allocations)
      ctx.fin.invoices
        .find((i) => i.id === a.invoiceId)
        ?.history.push(
          historyEntry(
            `Payment ${naira(a.amount)} confirmed`,
            `${p.no} · bank statement`,
            'success',
          ),
        );
    l.match = 'Confirmed';
    total += p.amount;
    ctx.refresh();
  }
  ctx.log(
    'finance',
    `${plural(lines.length, 'payment')} confirmed from a bank statement`,
    naira(total),
  );
  return statementView(ctx.refresh(), st);
});

/** A realistic CSV export for this account, including today’s pending transfers, to try matching. */
mock.get('/v1/finance/accounts/:id/sample-statement', (req) => {
  const ctx = finFor(req);
  const acc = findAccount(ctx, req.params.id!);
  const since = addDays(isoToday(), -10);
  const rows: [string, string, string, number, number][] = [];
  for (const p of ctx.fin.payments.filter(
    (x) =>
      x.accountId === acc.id && x.status === 'Confirmed' && x.date >= since && x.method !== 'Cash',
  ))
    rows.push([
      p.date,
      `NIP TRF FROM ${p.payer.toUpperCase()} ${ctx.students.get(p.studentKey)?.admissionNo ?? ''}`,
      p.reference,
      p.amount,
      0,
    ]);
  const pending = ctx.fin.payments.filter(
    (x) => x.status === 'Pending verification' && (x.accountId === acc.id || acc.showToParents),
  );
  pending.forEach((p, i) => {
    const s = ctx.students.get(p.studentKey);
    // One transfer arrives without the reference, to show a possible match.
    rows.push([
      addDays(p.date, i === 1 ? 1 : 0),
      `NIP TRF FROM ${p.payer.toUpperCase()}${i === 1 ? '' : ` ${s?.admissionNo ?? ''}`}`,
      i === 1 ? '' : p.reference,
      p.amount,
      0,
    ]);
  });
  rows.push([
    addDays(isoToday(), -2),
    'NIP TRF FROM OKORO JAMES SCHOOL FEES',
    'FBN/NIP/99120455',
    75000,
    0,
  ]);
  for (const t of ctx.fin.transfers.filter((x) => x.fromId === acc.id && x.date >= since))
    rows.push([
      t.date,
      `TRF TO ${ctx.fin.accounts.find((a) => a.id === t.toId)?.name.toUpperCase() ?? ''}`,
      t.no,
      0,
      t.amount,
    ]);
  rows.push([addDays(isoToday(), -1), 'SMS ALERT CHARGES', 'CHG/SMS', 0, 1200]);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const csv = [
    'Date,Description,Reference,Debit,Credit',
    ...rows.map(
      ([d, desc, ref, credit, debit]) => `${d},"${desc}",${ref},${debit || ''},${credit || ''}`,
    ),
  ].join('\n');
  return {
    fileName: `${acc.bank.toLowerCase().replace(/\s+/g, '-')}-${acc.accountNumber}-statement.csv`,
    text: csv,
  };
});
