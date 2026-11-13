import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { finance: f } = routesPath;
const FINANCE = { label: 'Finance', to: f.overview.name };
const crumb = (label: string, to: string) => ({ label, to });

export const financeRoutes: RouteRecordRaw[] = [
  {
    ...f.overview,
    component: () => import('@/views/finance/overview/FinanceOverviewView.vue'),
    meta: { title: 'Finance overview', breadcrumb: [{ label: 'Finance' }] },
  },
  {
    ...f.report,
    component: () => import('@/views/finance/overview/FinanceReportView.vue'),
    meta: {
      title: 'Finance report',
      nav: f.overview.name,
      breadcrumb: [FINANCE, { label: 'Reports' }],
    },
  },
  {
    ...f.accounts,
    component: () => import('@/views/finance/accounts/AccountsView.vue'),
    meta: {
      title: 'Bank & Cash Accounts',
      breadcrumb: [FINANCE, { label: 'Bank & Cash Accounts' }],
    },
  },
  {
    ...f.accountDetail,
    component: () => import('@/views/finance/accounts/AccountDetailView.vue'),
    meta: {
      title: 'Account',
      nav: f.accounts.name,
      breadcrumb: [FINANCE, crumb('Bank & Cash Accounts', f.accounts.name)],
    },
  },
  {
    ...f.statement,
    component: () => import('@/views/finance/accounts/StatementView.vue'),
    meta: {
      title: 'Bank statement',
      nav: f.accounts.name,
      breadcrumb: [FINANCE, crumb('Bank & Cash Accounts', f.accounts.name)],
    },
  },
  {
    ...f.fees,
    component: () => import('@/views/finance/fees/FeesView.vue'),
    meta: { title: 'Fees', breadcrumb: [FINANCE, { label: 'Fees' }] },
  },
  {
    ...f.feeStructure,
    component: () => import('@/views/finance/fees/FeeStructureView.vue'),
    meta: {
      title: 'Fee structure',
      nav: f.fees.name,
      breadcrumb: [FINANCE, crumb('Fees', f.fees.name), { label: 'Fee structure' }],
    },
  },
  {
    ...f.invoices,
    component: () => import('@/views/finance/invoices/InvoicesView.vue'),
    meta: { title: 'Invoices', breadcrumb: [FINANCE, { label: 'Invoices' }] },
  },
  {
    ...f.invoiceGenerate,
    component: () => import('@/views/finance/invoices/GenerateInvoicesView.vue'),
    meta: {
      title: 'Generate invoices',
      nav: f.invoices.name,
      breadcrumb: [FINANCE, crumb('Invoices', f.invoices.name), { label: 'Generate' }],
    },
  },
  {
    ...f.invoiceDetail,
    component: () => import('@/views/finance/invoices/InvoiceDetailView.vue'),
    meta: {
      title: 'Invoice',
      nav: f.invoices.name,
      breadcrumb: [FINANCE, crumb('Invoices', f.invoices.name)],
    },
  },
  {
    ...f.studentAccount,
    component: () => import('@/views/finance/invoices/StudentAccountView.vue'),
    meta: {
      title: 'Student account',
      nav: f.invoices.name,
      breadcrumb: [FINANCE, crumb('Invoices', f.invoices.name)],
    },
  },
  {
    ...f.payments,
    component: () => import('@/views/finance/payments/PaymentsView.vue'),
    meta: { title: 'Payments', breadcrumb: [FINANCE, { label: 'Payments' }] },
  },
  {
    ...f.paymentNew,
    component: () => import('@/views/finance/payments/RecordPaymentView.vue'),
    meta: {
      title: 'Record payment',
      nav: f.payments.name,
      breadcrumb: [FINANCE, crumb('Payments', f.payments.name), { label: 'Record payment' }],
    },
  },
  {
    ...f.paymentDetail,
    component: () => import('@/views/finance/payments/PaymentDetailView.vue'),
    meta: {
      title: 'Receipt',
      nav: f.payments.name,
      breadcrumb: [FINANCE, crumb('Payments', f.payments.name)],
    },
  },
  {
    ...f.refundDetail,
    component: () => import('@/views/finance/payments/RefundDetailView.vue'),
    meta: {
      title: 'Refund',
      nav: f.payments.name,
      breadcrumb: [FINANCE, crumb('Payments', f.payments.name), { label: 'Refund' }],
    },
  },
  {
    ...f.expenses,
    component: () => import('@/views/finance/expenses/ExpensesView.vue'),
    meta: { title: 'Expenses', breadcrumb: [FINANCE, { label: 'Expenses' }] },
  },
  {
    ...f.expenseDetail,
    component: () => import('@/views/finance/expenses/ExpenseDetailView.vue'),
    meta: {
      title: 'Expense',
      nav: f.expenses.name,
      breadcrumb: [FINANCE, crumb('Expenses', f.expenses.name)],
    },
  },
  {
    ...f.vendors,
    component: () => import('@/views/finance/vendors/VendorsView.vue'),
    meta: { title: 'Vendors', breadcrumb: [FINANCE, { label: 'Vendors' }] },
  },
  {
    ...f.vendorDetail,
    component: () => import('@/views/finance/vendors/VendorDetailView.vue'),
    meta: {
      title: 'Vendor',
      nav: f.vendors.name,
      breadcrumb: [FINANCE, crumb('Vendors', f.vendors.name)],
    },
  },
];
