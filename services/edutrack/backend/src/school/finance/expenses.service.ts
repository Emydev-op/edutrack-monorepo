import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { isUuid } from '../../platform/shared/params.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { FinanceCore } from './finance-core.service.js';
import { DRAFT_NO, type ExpenseRec, type VendorRec } from './finance-data.js';
import {
  BANKS,
  METHOD_DB,
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
  type ExpenseStatusLabel,
  type MethodLabel,
} from './finance-format.js';
import type { FinView } from './finance-view.js';
import type {
  ExpenseDto,
  ExpenseQueryDto,
  PayExpenseDto,
  VendorDto,
  VendorQueryDto,
} from './dto/expenses.dto.js';

const EXPENSE_METHODS: MethodLabel[] = ['Bank transfer', 'Cash', 'Cheque', 'POS', 'Other'];
const STATUSES: ExpenseStatusLabel[] = ['Draft', 'Submitted', 'Approved', 'Paid', 'Rejected'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;
const isPhone = (v: string) => NG_PHONE.test(v.replace(/[\s-]/g, ''));

interface CleanExpense {
  date: string;
  category: string;
  description: string;
  vendorId: string | null;
  branchId: string;
  amount: number;
  method: MethodLabel;
  notes: string;
  attachment: { name: string; size: string } | null;
  submit: boolean;
}

/**
 * Finance › Expenses and Vendors (as the School Admin mock's `finance-expenses.ts`). An expense is
 * saved as a draft, submitted for approval (numbered EXP-YYYY-0001 then), approved by the Bursar
 * (and by the Principal too above the expense limit), then paid from a school account. Vendors
 * are who the school buys from.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly core: FinanceCore) {}

  /* ---------------- Look-ups ---------------- */

  private find(v: FinView, id: string): ExpenseRec {
    const e = v.fin.expenses.find((x) => x.id === id || (!!x.no && x.no === id));
    if (!e) throw notFound('Expense not found', 'EXPENSE_NOT_FOUND');
    return e;
  }

  private findVendor(v: FinView, id: string): VendorRec {
    const found = isUuid(id) ? v.fin.vendors.find((x) => x.id === id) : undefined;
    if (!found) throw notFound('Vendor not found', 'VENDOR_NOT_FOUND');
    return found;
  }

  /* ---------------- Expenses ---------------- */

  async list(q: ExpenseQueryDto) {
    const v = await this.core.load();
    const branchId = v.branchScope(q.branch);
    const scoped = v.fin.expenses.filter((e) => !branchId || e.branchId === branchId);
    const search = (q.search ?? '').trim().toLowerCase();
    const rows = scoped
      .filter((e) => !q.status || e.status === q.status)
      .filter((e) => !q.category || e.category === q.category)
      .filter((e) => !q.vendor || e.vendorId === q.vendor)
      .filter((e) => (!q.from || e.date >= q.from) && (!q.to || e.date <= q.to))
      .map((e) => v.expenseRow(e))
      .filter(
        (e) =>
          !search ||
          `${e.no} ${e.description} ${e.vendor ?? ''} ${e.category}`.toLowerCase().includes(search),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    const counts = { All: scoped.length } as Record<ExpenseStatusLabel | 'All', number>;
    for (const s of STATUSES) counts[s] = scoped.filter((e) => e.status === s).length;
    const paid = scoped.filter((e) => e.status === 'Paid');
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const page = Math.max(1, Number(q.page) || 1);
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
      categories: v.fin.expenseCategories,
    };
  }

  private async detailOf(v: FinView, e: ExpenseRec) {
    const steps = v.approvalSteps(e);
    const limit = money(v.fin.settings.expenseLimit);
    return {
      ...v.expenseRow(e),
      branchId: e.branchId,
      method: e.method,
      accountId: e.accountId,
      account: v.fin.accounts.find((a) => a.id === e.accountId)?.name ?? null,
      paidOn: e.paidOn,
      paidRef: e.paidRef,
      attachment: e.attachment,
      rejectReason: e.rejectReason,
      notes: e.notes,
      steps: (['Bursar', 'Principal'] as const).map((role) => {
        const a = e.approvals.find((x) => x.role === role);
        const needed = steps.includes(role);
        return {
          role,
          limit: role === 'Bursar' ? `Up to ${limit}` : `Above ${limit}`,
          by: a?.by ?? null,
          on: a?.on ?? null,
          status: !needed
            ? ('Not needed' as const)
            : a
              ? ('Done' as const)
              : e.status === 'Rejected'
                ? ('Rejected' as const)
                : ('Waiting' as const),
        };
      }),
      canApprove: e.status === 'Submitted',
      history: await this.core.history('Expense', e.id),
    };
  }

  async detail(id: string) {
    const v = await this.core.load();
    return this.detailOf(v, this.find(v, id));
  }

  private clean(v: FinView, p: ExpenseDto): CleanExpense {
    const description = requireText(p.description, 'Describe what the money is for.', 500);
    if (!v.fin.expenseCategories.includes(p.category ?? ''))
      throw finFail('Choose a category.', 'VALIDATION');
    const amount = requireMoney(p.amount, 'Enter the amount in naira.');
    const date = requireDate(p.date, 'Enter the date of the expense.');
    if (date > v.today) throw finFail('The date can’t be in the future.', 'VALIDATION');
    const vendorId = p.vendorId || null;
    if (vendorId && !v.fin.vendors.some((x) => x.id === vendorId && x.status === 'Active'))
      throw finFail('Choose an active vendor.', 'VALIDATION');
    const branchId = v.activeBranches().find((b) => b.id === p.branchId)?.id;
    if (!branchId) throw finFail('Choose the branch.', 'VALIDATION');
    const method = EXPENSE_METHODS.includes(p.method as MethodLabel)
      ? (p.method as MethodLabel)
      : 'Bank transfer';
    if (p.submit && amount > v.fin.settings.expenseLimit && !p.attachment && vendorId)
      throw finFail(
        `Attach the vendor’s invoice: expenses above ${money(v.fin.settings.expenseLimit)} need one for the Principal.`,
        'VALIDATION',
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
      attachment: p.attachment ? { name: p.attachment.name, size: p.attachment.size } : null,
      submit: !!p.submit,
    };
  }

  /** The category's row, created the first time a default category is used. */
  private async categoryId(tx: TenantTx, v: FinView, name: string) {
    const known = v.fin.categoryIds.get(name);
    if (known) return known;
    const schoolId = this.core.schoolId();
    const row = await tx.expenseCategory.upsert({
      where: { schoolId_name: { schoolId, name } },
      create: { schoolId, name },
      update: {},
    });
    return row.id;
  }

  private fields(c: CleanExpense, categoryId: string) {
    return {
      spentOn: dateOnly(c.date),
      categoryId,
      description: c.description,
      vendorId: c.vendorId,
      branchId: c.branchId,
      amountKobo: kobo(c.amount),
      method: METHOD_DB[c.method],
      notes: c.notes,
      attachmentName: c.attachment?.name ?? null,
      attachmentSize: c.attachment?.size ?? null,
    };
  }

  /** Submits for approval: numbered on first submission. */
  private async submitIn(
    tx: TenantTx,
    v: FinView,
    id: string,
    no: string,
    c: { date: string; amount: number },
  ) {
    const number = no || (await this.core.nextNumber(tx, 'expense', 'EXP', c.date.slice(0, 4)));
    await tx.expense.update({
      where: { id },
      data: { status: 'SUBMITTED', number, submittedAt: this.core.now() },
    });
    await this.core.log(tx, [
      {
        entity: 'Expense',
        entityId: id,
        action: 'expense.submit',
        title: 'Submitted for approval',
        detail: `needs ${v.approvalSteps(c).join(' then ')}`,
      },
    ]);
    return number;
  }

  async create(p: ExpenseDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const c = this.clean(v, p);
      const categoryId = await this.categoryId(tx, v, c.category);
      const row = await tx.expense.create({
        data: {
          schoolId: this.core.schoolId(),
          number: `${DRAFT_NO}${randomUUID()}`,
          status: 'DRAFT',
          submittedById: this.core.userId(),
          ...this.fields(c, categoryId),
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Expense',
          entityId: row.id,
          action: 'expense.create',
          title: 'Saved as draft',
          tone: 'neutral',
        },
      ]);
      if (c.submit) await this.submitIn(tx, v, row.id, '', c);
      return row.id;
    });
    return this.detail(id);
  }

  async update(id: string, p: ExpenseDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const e = this.find(v, id);
      if (e.status !== 'Draft' && e.status !== 'Rejected')
        throw finConflict('Only drafts and rejected expenses can be edited.', 'EXPENSE_LOCKED');
      const c = this.clean(v, p);
      const categoryId = await this.categoryId(tx, v, c.category);
      await tx.expenseApproval.deleteMany({ where: { expenseId: e.id } });
      await tx.expense.update({
        where: { id: e.id },
        data: { ...this.fields(c, categoryId), status: 'DRAFT', rejectReason: null },
      });
      await this.core.log(tx, [
        {
          entity: 'Expense',
          entityId: e.id,
          action: 'expense.update',
          title: 'Edited',
          tone: 'neutral',
        },
      ]);
      if (c.submit) await this.submitIn(tx, v, e.id, e.no, c);
    });
    return this.detail(id);
  }

  async submit(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const e = this.find(v, id);
      if (e.status !== 'Draft')
        throw finConflict('Only a draft can be submitted.', 'EXPENSE_NOT_DRAFT');
      await this.submitIn(tx, v, e.id, e.no, e);
    });
    return this.detail(id);
  }

  /** Bursar step: `finance.expenses`. Principal step: the Principal (or the school's owner). */
  private async canGive(role: 'Bursar' | 'Principal') {
    if (role === 'Bursar') return this.core.permissions.has('finance.expenses');
    const keys = await this.core.roleKeys();
    return keys.has('principal') || keys.has('owner');
  }

  async approve(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const e = this.find(v, id);
      if (e.status !== 'Submitted')
        throw finConflict('Only a submitted expense can be approved.', 'EXPENSE_NOT_SUBMITTED');
      const role = v.nextApprover(e)!;
      if (!(await this.canGive(role)))
        throw AppException.forbidden(
          role === 'Principal'
            ? 'Only the Principal can give the second approval.'
            : 'Only the Bursar (finance staff who manage expenses) can approve this expense.',
          'EXPENSE_APPROVER',
        );
      const me = this.core.userId();
      if (me && e.approvals.some((a) => a.byId === me))
        throw AppException.forbidden(
          'You’ve already approved this expense. The next approval has to come from someone else.',
          'EXPENSE_APPROVER',
        );
      await tx.expenseApproval.create({
        data: {
          schoolId: this.core.schoolId(),
          expenseId: e.id,
          role: role === 'Bursar' ? 'BURSAR' : 'PRINCIPAL',
          approvedById: me!,
          approvedAt: this.core.now(),
        },
      });
      const next = v
        .approvalSteps(e)
        .find((r) => r !== role && !e.approvals.some((a) => a.role === r));
      if (!next) await tx.expense.update({ where: { id: e.id }, data: { status: 'APPROVED' } });
      await this.core.log(tx, [
        {
          entity: 'Expense',
          entityId: e.id,
          action: 'expense.approve',
          title: `Approved · ${role}`,
          detail: next ? `now waiting for the ${next}` : null,
          tone: 'success',
        },
      ]);
    });
    return this.detail(id);
  }

  async reject(id: string, reasonText?: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const e = this.find(v, id);
      if (e.status !== 'Submitted' && e.status !== 'Approved')
        throw finConflict(
          'Only a submitted or approved expense can be rejected.',
          'EXPENSE_NOT_SUBMITTED',
        );
      if (!(await this.canGive('Bursar')) && !(await this.canGive('Principal')))
        throw AppException.forbidden(
          'Only the Bursar or the Principal can reject an expense.',
          'EXPENSE_APPROVER',
        );
      const reason = requireText(reasonText, 'Say why, so it can be fixed and resubmitted.', 500);
      await tx.expense.update({
        where: { id: e.id },
        data: { status: 'REJECTED', rejectReason: reason },
      });
      await this.core.log(tx, [
        {
          entity: 'Expense',
          entityId: e.id,
          action: 'expense.reject',
          title: 'Rejected',
          detail: reason,
          tone: 'error',
        },
      ]);
    });
    return this.detail(id);
  }

  async pay(id: string, p: PayExpenseDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const e = this.find(v, id);
      if (e.status !== 'Approved')
        throw finConflict('Only an approved expense can be paid.', 'EXPENSE_NOT_APPROVED');
      const acc = v.fin.accounts.find((a) => a.id === p.accountId && a.status === 'Active');
      if (!acc) throw finFail('Choose the account it was paid from.', 'VALIDATION');
      const date = requireDate(p.date, 'Enter the payment date.');
      if (date > v.today) throw finFail('The date can’t be in the future.', 'VALIDATION');
      if (date < e.date) throw finFail('It can’t be paid before the expense date.', 'VALIDATION');
      const bal = v.ledger.accountBalance(acc.id);
      if (bal < e.amount)
        throw finFail(`${acc.name} only has ${money(bal)}.`, 'INSUFFICIENT_FUNDS');
      const reference = (p.reference ?? '').trim();
      if (acc.kind === 'Bank' && !reference)
        throw finFail('Enter the transfer or cheque reference.', 'VALIDATION');
      await tx.expense.update({
        where: { id: e.id },
        data: {
          status: 'PAID',
          paidFromAccountId: acc.id,
          paidAt: dateOnly(date),
          paidReference: reference || 'Cash voucher',
        },
      });
      await this.core.log(tx, [
        {
          entity: 'Expense',
          entityId: e.id,
          action: 'expense.pay',
          title: 'Paid',
          detail: `from ${acc.name}${reference ? ` · ${reference}` : ''}`,
          tone: 'success',
        },
      ]);
    });
    return this.detail(id);
  }

  async addCategory(nameText?: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const name = requireText(nameText, 'Name the category.', 60);
      if (v.fin.expenseCategories.some((c) => c.toLowerCase() === name.toLowerCase()))
        throw finFail('That category already exists.', 'VALIDATION');
      const schoolId = this.core.schoolId();
      await tx.expenseCategory.upsert({
        where: { schoolId_name: { schoolId, name } },
        create: { schoolId, name },
        update: { archivedAt: null },
      });
      await this.core.log(tx, [
        {
          entity: 'ExpenseCategory',
          action: 'expense.category',
          title: `Expense category added: ${name}`,
        },
      ]);
    });
    return (await this.core.load()).fin.expenseCategories;
  }

  /* ---------------- Vendors ---------------- */

  async vendors(q: VendorQueryDto) {
    const v = await this.core.load();
    const search = (q.search ?? '').trim().toLowerCase();
    const rows = v.fin.vendors
      .map((x) => v.vendorRow(x))
      .filter((x) => !q.status || x.status === q.status)
      .filter((x) => !q.category || x.category === q.category)
      .filter(
        (x) =>
          !search ||
          `${x.name} ${x.category} ${x.contactName} ${x.phone}`.toLowerCase().includes(search),
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
      paid: sum(rows.map((x) => x.paid)),
      outstanding: sum(rows.map((x) => x.outstanding)),
      active: rows.filter((x) => x.status === 'Active').length,
      categories: [...new Set(v.fin.vendors.map((x) => x.category))].sort(),
      banks: BANKS,
    };
  }

  private async vendorDetailOf(v: FinView, x: VendorRec) {
    return {
      ...v.vendorRow(x),
      address: x.address,
      notes: x.notes,
      rows: v.fin.expenses
        .filter((e) => e.vendorId === x.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => v.expenseRow(e)),
      history: await this.core.history('Vendor', x.id),
    };
  }

  async vendor(id: string) {
    const v = await this.core.load();
    return this.vendorDetailOf(v, this.findVendor(v, id));
  }

  private cleanVendor(v: FinView, p: VendorDto, exceptId?: string) {
    const name = requireText(p.name, 'Enter the vendor’s name.', 120);
    if (v.fin.vendors.some((x) => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase()))
      throw finFail('A vendor with that name already exists.', 'VALIDATION');
    const category = requireText(p.category, 'Choose what they supply.', 80);
    const phone = (p.phone ?? '').trim();
    if (phone && !isPhone(phone) && !/^0700\s?\d{3}\s?\d{4}$/.test(phone.replace(/\s/g, ' ')))
      throw finFail('Enter a valid Nigerian phone number.', 'VALIDATION');
    const email = (p.email ?? '').trim();
    if (email && !EMAIL.test(email)) throw finFail('Enter a valid email address.', 'VALIDATION');
    const bank = (p.bank ?? '').trim();
    const accountNumber = (p.accountNumber ?? '').replace(/\s/g, '');
    if (bank && bank !== 'Direct debit') {
      if (!BANKS.includes(bank)) throw finFail('Choose a bank from the list.', 'VALIDATION');
      if (!/^\d{10}$/.test(accountNumber))
        throw finFail('NUBAN account numbers are 10 digits.', 'VALIDATION');
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
        bank && bank !== 'Direct debit'
          ? requireText(p.accountName, 'Enter the account name.', 120)
          : '',
      notes: (p.notes ?? '').trim(),
    };
  }

  private vendorFields(c: ReturnType<ExpensesService['cleanVendor']>) {
    return {
      name: c.name,
      category: c.category,
      contactName: c.contactName || null,
      phone: c.phone || null,
      email: c.email || null,
      address: c.address || null,
      bankName: c.bank || null,
      accountNumber: c.accountNumber || null,
      accountName: c.accountName || null,
      notes: c.notes,
    };
  }

  async createVendor(p: VendorDto) {
    const id = await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const c = this.cleanVendor(v, p);
      const row = await tx.vendor.create({
        data: { schoolId: this.core.schoolId(), ...this.vendorFields(c) },
      });
      await this.core.log(tx, [
        { entity: 'Vendor', entityId: row.id, action: 'vendor.create', title: 'Vendor added' },
      ]);
      return row.id;
    });
    return this.vendor(id);
  }

  async updateVendor(id: string, p: VendorDto) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const x = this.findVendor(v, id);
      const c = this.cleanVendor(v, p, x.id);
      const bankChanged = c.bank !== x.bank || c.accountNumber !== x.accountNumber;
      await tx.vendor.update({ where: { id: x.id }, data: this.vendorFields(c) });
      await this.core.log(tx, [
        {
          entity: 'Vendor',
          entityId: x.id,
          action: 'vendor.update',
          title: bankChanged ? 'Bank details changed' : 'Details updated',
          tone: bankChanged ? 'warning' : 'info',
        },
      ]);
    });
    return this.vendor(id);
  }

  async toggleVendor(id: string) {
    await this.core.write(async (tx) => {
      const v = await this.core.load(tx);
      const x = this.findVendor(v, id);
      if (x.status === 'Active') {
        const open = v.fin.expenses.filter(
          (e) => e.vendorId === x.id && (e.status === 'Submitted' || e.status === 'Approved'),
        );
        if (open.length)
          throw finFail(
            `${plural(open.length, 'expense')} for ${x.name} ${open.length === 1 ? 'is' : 'are'} still waiting to be paid.`,
            'VENDOR_HAS_OPEN_EXPENSES',
          );
      }
      const next = x.status === 'Active' ? 'INACTIVE' : 'ACTIVE';
      await tx.vendor.update({ where: { id: x.id }, data: { status: next } });
      await this.core.log(tx, [
        {
          entity: 'Vendor',
          entityId: x.id,
          action: next === 'ACTIVE' ? 'vendor.reactivate' : 'vendor.deactivate',
          title: next === 'ACTIVE' ? 'Reactivated' : 'Deactivated',
          tone: 'neutral',
        },
      ]);
    });
    return this.vendor(id);
  }
}
