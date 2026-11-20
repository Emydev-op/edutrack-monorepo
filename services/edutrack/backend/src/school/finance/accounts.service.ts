import { Injectable } from '@nestjs/common';
import { isUuid } from '../../platform/shared/params.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { FinanceCore } from './finance-core.service.js';
import type { AccountRec, StatementLineRec, StatementRec } from './finance-data.js';
import {
  BANKS,
  FIN_ROUTE,
  MATCH_DB,
  addDays,
  dateOnly,
  daysBetween,
  finFail,
  kobo,
  last,
  money,
  notFound,
  plural,
  requireDate,
  requireMoney,
  requireText,
  sum,
  type MatchLabel,
} from './finance-format.js';
import { accountMovements, type Movement } from './finance-ledger.js';
import type { FinanceNotice, FinView } from './finance-view.js';
import { PaymentsService } from './payments.service.js';
import type {
  AccountDto,
  LedgerQuery,
  StatementLineDto,
  StatementUploadDto,
  TransferDto,
} from './dto/accounts.dto.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A CSV file as rows of cells (quoted fields, doubled quotes, CRLF), blank rows dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const num = (value: string | undefined) => {
  const n = Number((value ?? '').replace(/[₦,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
};
const parseDate = (value: string) => {
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

type RawLine = Pick<StatementLineRec, 'date' | 'description' | 'reference' | 'credit' | 'debit'>;
type MatchedLine = RawLine & { match: MatchLabel; paymentId: string | null; note: string };

/**
 * Finance › Bank & cash accounts (as the School Admin mock's `finance-accounts.ts`): the school's
 * accounts with balances worked out from what moved through them (opening balance, confirmed
 * payments, paid expenses and refunds, transfers), moving money between them, and bank
 * statements uploaded as CSV and matched to recorded payments so pending transfers can be
 * confirmed in one go.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly core: FinanceCore,
    private readonly payments: PaymentsService,
  ) {}

  private findAccount(v: FinView, id: string): AccountRec {
    const a = isUuid(id) ? v.fin.accounts.find((x) => x.id === id.toLowerCase()) : undefined;
    if (!a) throw notFound('Account not found', 'ACCOUNT_NOT_FOUND');
    return a;
  }

  private findStatement(v: FinView, id: string): StatementRec {
    const s = isUuid(id) ? v.fin.statements.find((x) => x.id === id.toLowerCase()) : undefined;
    if (!s) throw notFound('Statement not found', 'STATEMENT_NOT_FOUND');
    return s;
  }

  /* ---------------- Accounts ---------------- */

  accountRow(v: FinView, a: AccountRec) {
    const moves = accountMovements(v.fin, a);
    const monthStart = `${v.today.slice(0, 7)}-01`;
    const thisMonth = moves.filter((m) => m.date >= monthStart && m.kind !== 'Opening balance');
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      bank: a.bank,
      accountNumber: a.accountNumber,
      accountName: a.accountName,
      branchId: a.branchId,
      branch: v.branchName(a.branchId),
      showToParents: a.showToParents,
      status: a.status,
      balance: v.ledger.accountBalance(a.id),
      moneyIn: sum(thisMonth.map((m) => m.moneyIn)),
      moneyOut: sum(thisMonth.map((m) => m.moneyOut)),
      pending: v.ledger.accountPending(a.id),
      lastActivity: last(moves.filter((m) => m.kind !== 'Opening balance'))?.date ?? null,
      lastStatement:
        last(
          v.fin.statements
            .filter((s) => s.accountId === a.id)
            .map((s) => s.uploadedOn)
            .sort(),
        ) ?? null,
    };
  }

  async list() {
    const v = await this.core.load();
    const rows = v.fin.accounts.map((a) => this.accountRow(v, a));
    const active = rows.filter((x) => x.status === 'Active');
    const notices: FinanceNotice[] = [];
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
        title: `${money(pending)} in transfers waiting for verification`,
        description:
          'Upload the account’s bank statement to match them automatically, or verify them one by one.',
        action: {
          label: 'Verify payments',
          to: { name: FIN_ROUTE.payments, query: { tab: 'pending' } },
        },
      });
    const branchesWithout = v
      .activeBranches()
      .filter((b) => !active.some((x) => x.showToParents && (x.branchId === b.id || !x.branchId)))
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
  }

  private payload(v: FinView, p: AccountDto, exceptId?: string) {
    const name = requireText(p.name, 'Name the account, e.g. “Fees collection · Main Campus”.');
    if (
      v.fin.accounts.some((a) => a.id !== exceptId && a.name.toLowerCase() === name.toLowerCase())
    )
      throw finFail('Another account already has that name.', 'VALIDATION');
    const kind: 'Bank' | 'Cash' = p.kind === 'Cash' ? 'Cash' : 'Bank';
    let bank = '';
    let accountNumber = '';
    let accountName = '';
    if (kind === 'Bank') {
      bank = requireText(p.bank, 'Choose the bank.');
      if (!BANKS.includes(bank)) throw finFail('Choose a bank from the list.', 'VALIDATION');
      accountNumber = (p.accountNumber ?? '').replace(/\s/g, '');
      if (!/^\d{10}$/.test(accountNumber))
        throw finFail('NUBAN account numbers are 10 digits.', 'VALIDATION');
      if (
        v.fin.accounts.some(
          (a) => a.id !== exceptId && a.bank === bank && a.accountNumber === accountNumber,
        )
      )
        throw finFail('That account is already added.', 'VALIDATION');
      accountName = requireText(
        p.accountName,
        'Enter the account name exactly as the bank shows it.',
      );
    }
    const branchId = p.branchId
      ? (v.fin.branches.find((b) => b.id === p.branchId)?.id ?? null)
      : null;
    if (p.showToParents && kind === 'Cash')
      throw finFail('Only a bank account can be shown to parents.', 'VALIDATION');
    const openingBalance = requireMoney(
      p.openingBalance ?? 0,
      'Enter the opening balance in naira.',
      {
        allowZero: true,
      },
    );
    const openingDate = requireDate(
      p.openingDate ?? v.today,
      'Enter the date of the opening balance.',
    );
    if (openingDate > v.today)
      throw finFail('The opening balance date can’t be in the future.', 'VALIDATION');
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

  private data(x: ReturnType<AccountsService['payload']>) {
    return {
      name: x.name,
      kind: x.kind === 'Cash' ? ('CASH' as const) : ('BANK' as const),
      bankName: x.kind === 'Bank' ? x.bank : null,
      accountNumber: x.kind === 'Bank' ? x.accountNumber : null,
      accountName: x.kind === 'Bank' ? x.accountName : null,
      branchId: x.branchId,
      showToParents: x.showToParents,
      openingBalanceKobo: kobo(x.openingBalance),
      openingOn: dateOnly(x.openingDate),
    };
  }

  /** One parent-facing account per branch (or one school-wide). */
  private async claimParents(
    tx: TenantTx,
    id: string,
    x: { showToParents: boolean; branchId: string | null },
  ) {
    if (!x.showToParents) return;
    await tx.bankAccount.updateMany({
      where: { id: { not: id }, showToParents: true, branchId: x.branchId },
      data: { showToParents: false },
    });
  }

  private async rowOf(id: string) {
    const v = await this.core.load();
    return this.accountRow(v, this.findAccount(v, id));
  }

  async create(dto: AccountDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const x = this.payload(v, dto);
      const row = await tx.bankAccount.create({
        data: { schoolId: this.core.schoolId(), ...this.data(x) },
      });
      await this.claimParents(tx, row.id, x);
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: row.id,
          action: 'account.create',
          title: `Account added: ${x.name}`,
          detail: x.kind === 'Bank' ? `${x.bank} ${x.accountNumber}` : 'Cash',
        },
      ]);
      return row.id;
    });
    return this.rowOf(id);
  }

  async update(id: string, dto: AccountDto) {
    const accountId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const a = this.findAccount(v, id);
      const x = this.payload(v, dto, a.id);
      const used = accountMovements(v.fin, a).length > 1;
      if (used && x.kind !== a.kind)
        throw finFail(
          'An account with transactions can’t change between bank and cash.',
          'VALIDATION',
        );
      await tx.bankAccount.update({ where: { id: a.id }, data: this.data(x) });
      await this.claimParents(tx, a.id, x);
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: a.id,
          action: 'account.update',
          title: `Account updated: ${x.name}`,
        },
      ]);
      return a.id;
    });
    return this.rowOf(accountId);
  }

  async toggle(id: string) {
    const accountId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const a = this.findAccount(v, id);
      if (a.status === 'Active') {
        const bal = v.ledger.accountBalance(a.id);
        if (bal !== 0)
          throw finFail(
            `Move the ${money(bal)} balance to another account before deactivating.`,
            'ACCOUNT_HAS_BALANCE',
          );
        if (v.ledger.accountPending(a.id))
          throw finFail(
            'Verify or reject the transfers waiting on this account first.',
            'ACCOUNT_HAS_PENDING',
          );
        await tx.bankAccount.update({
          where: { id: a.id },
          data: { status: 'INACTIVE', showToParents: false },
        });
      } else await tx.bankAccount.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: a.id,
          action: 'account.toggle',
          title: `Account ${a.status === 'Active' ? 'deactivated' : 'reactivated'}: ${a.name}`,
          tone: 'neutral',
        },
      ]);
      return a.id;
    });
    return this.rowOf(accountId);
  }

  private linkOf(m: Movement) {
    if (!m.link) return null;
    const name =
      m.link.type === 'payment'
        ? FIN_ROUTE.paymentDetail
        : m.link.type === 'expense'
          ? FIN_ROUTE.expenseDetail
          : m.link.type === 'refund'
            ? FIN_ROUTE.refundDetail
            : null;
    return name ? { name, params: { id: m.link.id } } : null;
  }

  async get(id: string, q: LedgerQuery) {
    const v = await this.core.load();
    const a = this.findAccount(v, id);
    let bal = 0;
    const rows = accountMovements(v.fin, a).map((m) => ({
      id: m.id,
      date: m.date,
      kind: m.kind,
      ref: m.ref,
      description: m.description,
      moneyIn: m.moneyIn,
      moneyOut: m.moneyOut,
      balance: (bal += m.moneyIn - m.moneyOut),
      to: this.linkOf(m),
    }));
    const search = (q.search ?? '').toLowerCase();
    const filtered = rows
      .filter((x) => (!q.from || x.date >= q.from) && (!q.to || x.date <= q.to))
      .filter((x) => !q.kind || x.kind.startsWith(q.kind))
      .filter((x) => !search || `${x.ref} ${x.description}`.toLowerCase().includes(search))
      .reverse();
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const page = Math.max(1, Number(q.page) || 1);
    const [ty, tm] = v.today.split('-').map(Number) as [number, number];
    const monthly = [3, 2, 1, 0].map((back) => {
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
      ...this.accountRow(v, a),
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
      statements: v.fin.statements
        .filter((s) => s.accountId === a.id)
        .map((s) => this.statementSummary(s))
        .reverse(),
      monthly,
    };
  }

  /* ---------------- Transfers ---------------- */

  async transfer(dto: TransferDto) {
    return this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const from = v.fin.accounts.find((a) => a.id === dto.fromId && a.status === 'Active');
      const to = v.fin.accounts.find((a) => a.id === dto.toId && a.status === 'Active');
      if (!from || !to) throw finFail('Choose both accounts.', 'VALIDATION');
      if (from.id === to.id) throw finFail('Choose two different accounts.', 'VALIDATION');
      const amount = requireMoney(dto.amount, 'Enter the amount moved.');
      const date = requireDate(dto.date, 'Enter the date.');
      if (date > v.today) throw finFail('The date can’t be in the future.', 'VALIDATION');
      const bal = v.ledger.accountBalance(from.id, date);
      if (amount > bal)
        throw finFail(
          `${from.name} only had ${money(bal)} on ${fmtDate(date)}.`,
          'INSUFFICIENT_FUNDS',
        );
      const no = await this.core.nextNumber(tx, 'transfer', 'TRF', date.slice(0, 4));
      const row = await tx.accountTransfer.create({
        data: {
          schoolId: this.core.schoolId(),
          number: no,
          transferredOn: dateOnly(date),
          fromAccountId: from.id,
          toAccountId: to.id,
          amountKobo: kobo(amount),
          reference: (dto.reference ?? '').trim(),
          note: (dto.note ?? '').trim(),
          createdById: this.core.userId(),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: from.id,
          action: 'account.transfer',
          title: `${money(amount)} moved to ${to.name}`,
          detail: no,
        },
        {
          entity: 'BankAccount',
          entityId: to.id,
          action: 'account.transfer',
          title: `${money(amount)} received from ${from.name}`,
          detail: no,
        },
      ]);
      return { id: row.id, no };
    });
  }

  /* ---------------- Statements ---------------- */

  statementSummary(s: StatementRec) {
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

  private statementView(v: FinView, s: StatementRec) {
    const acc = this.findAccount(v, s.accountId);
    const pay = (id: string | null) => v.fin.payments.find((p) => p.id === id);
    return {
      ...this.statementSummary(s),
      accountId: acc.id,
      account: acc.name,
      rows: s.lines.map((l) => {
        const p = pay(l.paymentId);
        return {
          id: l.id,
          date: l.date,
          description: l.description,
          reference: l.reference,
          credit: l.credit,
          debit: l.debit,
          match: l.match,
          paymentId: l.paymentId,
          paymentNo: p?.no ?? null,
          student: p ? (v.students.get(p.studentKey)?.name ?? null) : null,
          note: l.note,
        };
      }),
      pendingInAccount: v.fin.payments
        .filter(
          (p) =>
            p.status === 'Pending verification' && (p.accountId === acc.id || acc.kind === 'Bank'),
        )
        .map((p) => ({
          id: p.id,
          no: p.no,
          student: v.students.get(p.studentKey)?.name ?? '',
          amount: p.amount,
          date: p.date,
          reference: p.reference,
        })),
    };
  }

  private async statementOf(id: string) {
    const v = await this.core.load();
    return this.statementView(v, this.findStatement(v, id));
  }

  /** Matches each statement line to a payment, expense, transfer or refund already recorded. */
  private matchLines(v: FinView, acc: AccountRec, raw: RawLine[]): MatchedLine[] {
    const taken = new Set<string>();
    const pending = v.fin.payments.filter((p) => p.status === 'Pending verification');
    const confirmed = v.fin.payments.filter(
      (p) => p.status === 'Confirmed' && p.accountId === acc.id,
    );
    return raw.map((l): MatchedLine => {
      const text = `${l.description} ${l.reference}`.toUpperCase();
      const mentions = (p: { reference: string; studentKey: string }) => {
        const s = v.students.get(p.studentKey);
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
      const near = (d: string | null) => !!d && Math.abs(daysBetween(d, l.date)) <= 3;
      const spent = v.fin.expenses.some(
        (e) => e.accountId === acc.id && e.amount === l.debit && near(e.paidOn),
      );
      const moved = v.fin.transfers.some(
        (t) => t.fromId === acc.id && t.amount === l.debit && near(t.date),
      );
      const refunded = v.fin.refunds.some(
        (x) => x.paidFrom === acc.id && x.amount === l.debit && near(x.paidOn),
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

  async upload(accountId: string, dto: StatementUploadDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const acc = this.findAccount(v, accountId);
      if (acc.kind !== 'Bank') throw finFail('Statements are for bank accounts.', 'VALIDATION');
      const rows = parseCsv(dto.text ?? '');
      if (rows.length < 2)
        throw finFail(
          'The file has no transactions. Export the statement as CSV with a header row.',
          'STATEMENT_EMPTY',
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
        throw finFail(
          'Couldn’t find the Date, Description and Credit columns. Use the bank’s CSV export or the sample statement layout.',
          'STATEMENT_COLUMNS',
        );
      const bad: number[] = [];
      const lines: RawLine[] = rows.slice(1).flatMap((row, i) => {
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
            date,
            description: (row[ci.desc] ?? '').trim(),
            reference: ci.ref >= 0 ? (row[ci.ref] ?? '').trim() : '',
            credit,
            debit,
          },
        ];
      });
      if (!lines.length)
        throw finFail(
          `No transactions could be read${bad.length ? ` (bad dates on rows ${bad.slice(0, 5).join(', ')})` : ''}.`,
          'STATEMENT_EMPTY',
        );
      if (lines.length > 5000) throw finFail('Upload at most 5,000 lines at a time.', 'VALIDATION');
      const matched = this.matchLines(v, acc, lines);
      const schoolId = this.core.schoolId();
      const fileName = (dto.fileName ?? 'statement.csv').trim() || 'statement.csv';
      const st = await tx.bankStatement.create({
        data: {
          schoolId,
          bankAccountId: acc.id,
          fileName,
          uploadedById: this.core.userId(),
        },
      });
      await tx.bankStatementLine.createMany({
        data: matched.map((l, i) => ({
          schoolId,
          statementId: st.id,
          lineNo: i + 1,
          postedOn: dateOnly(l.date),
          description: l.description,
          reference: l.reference,
          creditKobo: kobo(l.credit),
          debitKobo: kobo(l.debit),
          match: MATCH_DB[l.match],
          paymentId: l.paymentId,
          note: l.note,
        })),
      });
      const found = matched.filter(
        (l) => l.match === 'Matched' || l.match === 'Possible match',
      ).length;
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: acc.id,
          action: 'statement.upload',
          title: `Statement uploaded for ${acc.name}`,
          detail: `${fileName} · ${plural(matched.length, 'line')} · ${found} matched`,
        },
      ]);
      return st.id;
    });
    return this.statementOf(id);
  }

  getStatement(id: string) {
    return this.statementOf(id);
  }

  async updateLine(id: string, lineId: string, dto: StatementLineDto) {
    const statementId = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const st = this.findStatement(v, id);
      const line = st.lines.find((l) => l.id === lineId);
      if (!line) throw notFound('Line not found', 'LINE_NOT_FOUND');
      if (line.match === 'Confirmed' || line.match === 'Already recorded')
        throw finFail('This line is already recorded.', 'LINE_RECORDED', 409);
      const actor = v.actor;
      if (dto.ignore) {
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { match: 'IGNORED', paymentId: null, note: `Ignored by ${actor}` },
        });
      } else if (dto.paymentId) {
        const pay = v.fin.payments.find(
          (x) => x.id === dto.paymentId && x.status === 'Pending verification',
        );
        if (!pay) throw finFail('Choose a payment waiting for verification.', 'VALIDATION');
        if (pay.amount !== line.credit)
          throw finFail(
            `${pay.no} is ${money(pay.amount)}, but this line is ${money(line.credit)}.`,
            'AMOUNT_MISMATCH',
          );
        const others = st.lines.filter(
          (o) => o.id !== line.id && o.paymentId === pay.id && o.match !== 'Confirmed',
        );
        if (others.length)
          await tx.bankStatementLine.updateMany({
            where: { id: { in: others.map((o) => o.id) } },
            data: { match: 'NO_MATCH', paymentId: null, note: 'Unlinked' },
          });
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { match: 'MATCHED', paymentId: pay.id, note: `Matched by ${actor}` },
        });
      } else
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { match: 'NO_MATCH', paymentId: null, note: 'Unlinked' },
        });
      return st.id;
    });
    return this.statementOf(statementId);
  }

  async confirm(id: string, lineIds: string[] = []) {
    let flush: () => Promise<void> = () => Promise.resolve();
    const statementId = await this.core.write(async (tx) => {
      let v = await this.core.load(tx);
      const st = this.findStatement(v, id);
      const lines = st.lines.filter(
        (l) =>
          (l.match === 'Matched' || l.match === 'Possible match') &&
          l.paymentId &&
          (!lineIds.length || lineIds.includes(l.id)),
      );
      if (!lines.length) throw finFail('There are no matched lines to confirm.', 'NOTHING_MATCHED');
      const confirmed: string[] = [];
      let total = 0;
      for (const l of lines) {
        const p = v.fin.payments.find((x) => x.id === l.paymentId);
        if (!p || p.status !== 'Pending verification') continue;
        await this.payments.verifyPayment(
          tx,
          v,
          p,
          `matched on ${st.fileName} (${fmtDate(l.date)})`,
          { accountId: st.accountId },
        );
        await tx.bankStatementLine.update({ where: { id: l.id }, data: { match: 'CONFIRMED' } });
        confirmed.push(p.id);
        total += p.amount;
        v = await this.core.load(tx);
      }
      const acc = this.findAccount(v, st.accountId);
      await this.core.log(tx, [
        {
          entity: 'BankAccount',
          entityId: acc.id,
          action: 'statement.confirm',
          title: `${plural(confirmed.length, 'payment')} confirmed from a bank statement`,
          detail: `${st.fileName} · ${money(total)}`,
          tone: 'success',
        },
      ]);
      flush = await this.payments.confirmedMessage(tx, confirmed);
      return st.id;
    });
    await flush();
    return this.statementOf(statementId);
  }

  /** A realistic CSV export for this account, including pending transfers, to try matching. */
  async sample(id: string) {
    const v = await this.core.load();
    const acc = this.findAccount(v, id);
    const since = addDays(v.today, -10);
    const rows: [string, string, string, number, number][] = [];
    for (const p of v.fin.payments.filter(
      (x) =>
        x.accountId === acc.id &&
        x.status === 'Confirmed' &&
        x.date >= since &&
        x.method !== 'Cash',
    ))
      rows.push([
        p.date,
        `NIP TRF FROM ${p.payer.toUpperCase()} ${v.students.get(p.studentKey)?.admissionNo ?? ''}`,
        p.reference,
        p.amount,
        0,
      ]);
    const pending = v.fin.payments.filter(
      (x) => x.status === 'Pending verification' && (x.accountId === acc.id || acc.showToParents),
    );
    pending.forEach((p, i) => {
      const s = v.students.get(p.studentKey);
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
      addDays(v.today, -2),
      'NIP TRF FROM OKORO JAMES SCHOOL FEES',
      'FBN/NIP/99120455',
      75000,
      0,
    ]);
    for (const t of v.fin.transfers.filter((x) => x.fromId === acc.id && x.date >= since))
      rows.push([
        t.date,
        `TRF TO ${v.fin.accounts.find((a) => a.id === t.toId)?.name.toUpperCase() ?? ''}`,
        t.no,
        0,
        t.amount,
      ]);
    rows.push([addDays(v.today, -1), 'SMS ALERT CHARGES', 'CHG/SMS', 0, 1200]);
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    const csv = [
      'Date,Description,Reference,Debit,Credit',
      ...rows.map(
        ([d, desc, ref, credit, debit]) => `${d},"${desc}",${ref},${debit || ''},${credit || ''}`,
      ),
    ].join('\n');
    return {
      fileName: `${(acc.bank || 'bank').toLowerCase().replace(/\s+/g, '-')}-${acc.accountNumber}-statement.csv`,
      text: csv,
    };
  }
}
