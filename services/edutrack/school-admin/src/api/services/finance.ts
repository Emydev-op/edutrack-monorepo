import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AccountDetail,
  AccountPayload,
  AccountsView,
  AccountTransferPayload,
  BankAccountRow,
  Discount,
  DiscountPayload,
  ExpenseDetail,
  ExpenseList,
  ExpensePayload,
  ExpenseQuery,
  FeeItem,
  FeeItemPayload,
  FeesOverview,
  FeeStructureView,
  FinanceOptions,
  FinanceOverview,
  FinanceQuery,
  FinanceSettings,
  FinanceSettingsPayload,
  GeneratePayload,
  GeneratePreview,
  InvoiceDetail,
  InvoiceList,
  InvoiceQuery,
  PayerSearchRow,
  PayExpensePayload,
  PaymentDetail,
  PaymentList,
  PaymentPayload,
  PaymentPlan,
  PaymentPlanPayload,
  PaymentQuery,
  RefundDetail,
  RefundPayload,
  RefundRow,
  ReportId,
  ReportView,
  StatementView,
  StructureSavePayload,
  StudentAccount,
  VendorDetail,
  VendorPayload,
  VendorRow,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.finance;

/**
 * Money shows up across the app: student profiles and balances, guardians, the dashboard, branch
 * figures, the Setup Center and sidebar counts. Any finance change refreshes all of them.
 */
export function useFinanceMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [
          k.all,
          queryKeys.students.all,
          queryKeys.guardians.all,
          queryKeys.dashboard.all,
          queryKeys.branches.all,
          queryKeys.setup.all,
          queryKeys.navCounts,
          queryKeys.academics.all,
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}

const q = <T>(params: MaybeRefOrGetter<object>) =>
  cleanParams(toValue(params) as Record<string, unknown>) as T;

/* ---------------- Shared ---------------- */

export const useFinanceOptionsQuery = () =>
  useQuery({
    queryKey: k.options,
    queryFn: () => getRequest<FinanceOptions>('/v1/finance/options'),
  });

export const useFinanceOverviewQuery = (params: MaybeRefOrGetter<FinanceQuery>) =>
  useQuery({
    queryKey: computed(() => k.overview(q(params))),
    queryFn: () => getRequest<FinanceOverview>('/v1/finance/overview', { params: q(params) }),
  });

export const useFinanceReportQuery = (
  id: MaybeRefOrGetter<ReportId>,
  params: MaybeRefOrGetter<FinanceQuery>,
) =>
  useQuery({
    queryKey: computed(() => k.report(toValue(id), q(params))),
    queryFn: () =>
      getRequest<ReportView>(`/v1/finance/reports/${toValue(id)}`, { params: q(params) }),
  });

/* ---------------- Fees ---------------- */

export const useFeesQuery = (params: MaybeRefOrGetter<FinanceQuery>) =>
  useQuery({
    queryKey: computed(() => k.fees(q(params))),
    queryFn: () => getRequest<FeesOverview>('/v1/finance/fees', { params: q(params) }),
  });

export const useStartFeesMutation = () =>
  useFinanceMutation((mode: 'suggested' | 'tuition') =>
    postRequest('/v1/finance/fees/start', { mode }),
  );

export const useSaveFeeItemMutation = () =>
  useFinanceMutation(({ id, ...body }: FeeItemPayload & { id?: string }) =>
    id
      ? putRequest<FeeItem>(`/v1/finance/fees/items/${id}`, body)
      : postRequest<FeeItem>('/v1/finance/fees/items', body),
  );
export const useRemoveFeeItemMutation = () =>
  useFinanceMutation((id: string) =>
    deleteRequest<{ archived: boolean }>(`/v1/finance/fees/items/${id}`),
  );
export const useRestoreFeeItemMutation = () =>
  useFinanceMutation((id: string) => postRequest<FeeItem>(`/v1/finance/fees/items/${id}/restore`));

export const useFeeStructureQuery = (
  params: MaybeRefOrGetter<{ term?: string; branch?: string }>,
) =>
  useQuery({
    queryKey: computed(() => k.structure(q(params))),
    queryFn: () =>
      getRequest<FeeStructureView>('/v1/finance/fees/structure', { params: q(params) }),
    placeholderData: keepPreviousData,
  });
export const useSaveStructureMutation = () =>
  useFinanceMutation((body: StructureSavePayload) =>
    putRequest<FeeStructureView>('/v1/finance/fees/structure', body),
  );
export const usePublishStructureMutation = () =>
  useFinanceMutation((body: { termId: string; branchId: string }) =>
    postRequest<FeeStructureView>('/v1/finance/fees/structure/publish', body),
  );
export const useCopyStructureMutation = () =>
  useFinanceMutation(
    (body: {
      fromTermId: string;
      toTermId: string;
      branchId?: string;
      fromBranchId?: string;
      allBranches?: boolean;
    }) => postRequest<FeeStructureView>('/v1/finance/fees/structure/copy', body),
  );

export const useDiscountsQuery = () =>
  useQuery({
    queryKey: k.discounts,
    queryFn: () => getRequest<Discount[]>('/v1/finance/discounts'),
  });
export const useSaveDiscountMutation = () =>
  useFinanceMutation(({ id, ...body }: DiscountPayload & { id?: string }) =>
    id
      ? putRequest<Discount>(`/v1/finance/discounts/${id}`, body)
      : postRequest<Discount>('/v1/finance/discounts', body),
  );

export const usePlansQuery = () =>
  useQuery({ queryKey: k.plans, queryFn: () => getRequest<PaymentPlan[]>('/v1/finance/plans') });
export const useSavePlanMutation = () =>
  useFinanceMutation(({ id, ...body }: PaymentPlanPayload & { id?: string }) =>
    id
      ? putRequest<PaymentPlan>(`/v1/finance/plans/${id}`, body)
      : postRequest<PaymentPlan>('/v1/finance/plans', body),
  );
export const usePlanDefaultMutation = () =>
  useFinanceMutation((id: string) => postRequest<PaymentPlan>(`/v1/finance/plans/${id}/default`));
export const usePlanToggleMutation = () =>
  useFinanceMutation((id: string) => postRequest<PaymentPlan>(`/v1/finance/plans/${id}/toggle`));

export const useFinanceSettingsQuery = () =>
  useQuery({
    queryKey: k.settings,
    queryFn: () => getRequest<FinanceSettings>('/v1/finance/settings'),
  });
export const useSaveFinanceSettingsMutation = () =>
  useFinanceMutation((body: FinanceSettingsPayload) =>
    putRequest<FinanceSettings>('/v1/finance/settings', body),
  );

/* ---------------- Invoices ---------------- */

export const useInvoicesQuery = (params: MaybeRefOrGetter<InvoiceQuery>) =>
  useQuery({
    queryKey: computed(() => k.invoices(q(params))),
    queryFn: () => getRequest<InvoiceList>('/v1/finance/invoices', { params: q(params) }),
    placeholderData: keepPreviousData,
  });

export const useInvoiceQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.invoice(toValue(id))),
    queryFn: () => getRequest<InvoiceDetail>(`/v1/finance/invoices/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

export const useGeneratePreviewMutation = () =>
  useMutation({
    mutationFn: (body: GeneratePayload) =>
      postRequest<GeneratePreview>('/v1/finance/invoices/generate/preview', body),
  });
export const useGenerateInvoicesMutation = () =>
  useFinanceMutation((body: GeneratePayload) =>
    postRequest<{ created: number; issued: number; total: number; notified: number }>(
      '/v1/finance/invoices/generate',
      body,
    ),
  );
export const useIssueInvoicesMutation = () =>
  useFinanceMutation((ids: string[]) =>
    postRequest<{ issued: number; notified: number }>('/v1/finance/invoices/issue', { ids }),
  );

export interface RemindResult {
  invoices: number;
  recipients: number;
  skipped: number;
  cost: number;
  total: number;
}
type RemindBody = { ids?: string[]; overdue?: boolean; termId?: string; branch?: string };
export const useRemindPreviewMutation = () =>
  useMutation({
    mutationFn: (body: RemindBody) =>
      postRequest<RemindResult>('/v1/finance/invoices/remind', { ...body, preview: true }),
  });
export const useSendRemindersMutation = () =>
  useFinanceMutation((body: RemindBody) =>
    postRequest<RemindResult>('/v1/finance/invoices/remind', body),
  );
export const useApplyLateFeesMutation = () =>
  useFinanceMutation((body: { termId?: string; branch?: string; ids?: string[] }) =>
    postRequest<{ applied: number; total: number }>('/v1/finance/invoices/late-fees', body),
  );

const inv = (id: string, path = '') => `/v1/finance/invoices/${id}${path}`;
export const useAddInvoiceLineMutation = () =>
  useFinanceMutation(
    ({ id, ...body }: { id: string; itemId?: string; label?: string; amount?: number }) =>
      postRequest<InvoiceDetail>(inv(id, '/lines'), body),
  );
export const useRemoveInvoiceLineMutation = () =>
  useFinanceMutation(({ id, lineId, reason }: { id: string; lineId: string; reason?: string }) =>
    deleteRequest<InvoiceDetail>(inv(id, `/lines/${lineId}`), { params: cleanParams({ reason }) }),
  );
export const useApplyDiscountMutation = () =>
  useFinanceMutation(
    ({ id, ...body }: { id: string; discountId: string; amount?: number; reason?: string }) =>
      postRequest<InvoiceDetail>(inv(id, '/discounts'), body),
  );
export const useRemoveDiscountMutation = () =>
  useFinanceMutation(({ id, lineId }: { id: string; lineId: string }) =>
    deleteRequest<InvoiceDetail>(inv(id, `/discounts/${lineId}`)),
  );
export const useChangePlanMutation = () =>
  useFinanceMutation(({ id, planId }: { id: string; planId: string }) =>
    putRequest<InvoiceDetail>(inv(id, '/plan'), { planId }),
  );
export const useApplyCreditMutation = () =>
  useFinanceMutation(({ id, amount }: { id: string; amount: number }) =>
    postRequest<InvoiceDetail>(inv(id, '/apply-credit'), { amount }),
  );
export const useCancelInvoiceMutation = () =>
  useFinanceMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<InvoiceDetail>(inv(id, '/cancel'), { reason }),
  );
export const useRemindInvoiceMutation = () =>
  useFinanceMutation((id: string) => postRequest<{ sentTo: string }>(inv(id, '/remind')));
export const useSendPaymentDetailsMutation = () =>
  useFinanceMutation((key: string) =>
    postRequest<{ sentTo: string }>(`/v1/finance/students/${key}/send-details`),
  );

/* ---------------- Student accounts ---------------- */

export const useFinanceStudentsQuery = (
  params: MaybeRefOrGetter<{ search?: string; branch?: string; owing?: boolean; limit?: number }>,
  enabled: MaybeRefOrGetter<boolean> = true,
) =>
  useQuery({
    queryKey: computed(() => k.students(q(params))),
    queryFn: () => getRequest<PayerSearchRow[]>('/v1/finance/students', { params: q(params) }),
    enabled: computed(() => toValue(enabled)),
    placeholderData: keepPreviousData,
  });

export const useStudentAccountQuery = (key: MaybeRefOrGetter<string | null | undefined>) =>
  useQuery({
    queryKey: computed(() => k.account(toValue(key) ?? '')),
    queryFn: () => getRequest<StudentAccount>(`/v1/finance/students/${toValue(key)}`),
    enabled: computed(() => !!toValue(key)),
  });

/* ---------------- Payments & refunds ---------------- */

export const usePaymentsQuery = (params: MaybeRefOrGetter<PaymentQuery>) =>
  useQuery({
    queryKey: computed(() => k.payments(q(params))),
    queryFn: () => getRequest<PaymentList>('/v1/finance/payments', { params: q(params) }),
    placeholderData: keepPreviousData,
  });
export const usePaymentQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.payment(toValue(id))),
    queryFn: () => getRequest<PaymentDetail>(`/v1/finance/payments/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

export interface PaymentCheck {
  status: 'Pending verification' | 'Confirmed';
  allocations: { invoiceId: string; no: string; amount: number; before: number; after: number }[];
  credit: number;
}
export const useCheckPaymentMutation = () =>
  useMutation({
    mutationFn: (body: PaymentPayload) =>
      postRequest<PaymentCheck>('/v1/finance/payments/check', body),
  });
export const useRecordPaymentMutation = () =>
  useFinanceMutation((body: PaymentPayload) =>
    postRequest<PaymentDetail>('/v1/finance/payments', body),
  );
export const useVerifyPaymentMutation = () =>
  useFinanceMutation((id: string) =>
    postRequest<PaymentDetail>(`/v1/finance/payments/${id}/verify`),
  );
export const useVerifyPaymentsMutation = () =>
  useFinanceMutation((ids: string[]) =>
    postRequest<{ verified: number; total: number }>('/v1/finance/payments/verify-bulk', { ids }),
  );
export const useRejectPaymentMutation = () =>
  useFinanceMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<PaymentDetail>(`/v1/finance/payments/${id}/reject`, { reason }),
  );

export const useRefundsQuery = (params: MaybeRefOrGetter<{ status?: string; branch?: string }>) =>
  useQuery({
    queryKey: computed(() => k.refunds(q(params))),
    queryFn: () =>
      getRequest<{ rows: RefundRow[]; awaiting: number; toPay: number; paid: number }>(
        '/v1/finance/refunds',
        { params: q(params) },
      ),
  });
export const useRefundQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.refund(toValue(id))),
    queryFn: () => getRequest<RefundDetail>(`/v1/finance/refunds/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });
export const useRequestRefundMutation = () =>
  useFinanceMutation((body: RefundPayload) =>
    postRequest<RefundDetail>('/v1/finance/refunds', body),
  );
export const useApproveRefundMutation = () =>
  useFinanceMutation(
    ({ id, ...body }: { id: string; acknowledged: boolean; asProprietor?: boolean }) =>
      postRequest<RefundDetail>(`/v1/finance/refunds/${id}/approve`, body),
  );
export const useRejectRefundMutation = () =>
  useFinanceMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<RefundDetail>(`/v1/finance/refunds/${id}/reject`, { reason }),
  );
export const usePayRefundMutation = () =>
  useFinanceMutation(
    ({ id, ...body }: { id: string; accountId: string; date: string; reference: string }) =>
      postRequest<RefundDetail>(`/v1/finance/refunds/${id}/pay`, body),
  );

/* ---------------- Accounts ---------------- */

export const useAccountsQuery = () =>
  useQuery({
    queryKey: k.accounts,
    queryFn: () => getRequest<AccountsView>('/v1/finance/accounts'),
  });
export const useBankAccountQuery = (
  id: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<{
    search?: string;
    kind?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }>,
) =>
  useQuery({
    queryKey: computed(() => k.bankAccount(toValue(id), q(params))),
    queryFn: () =>
      getRequest<AccountDetail>(`/v1/finance/accounts/${toValue(id)}`, { params: q(params) }),
    enabled: computed(() => !!toValue(id)),
    placeholderData: keepPreviousData,
  });
export const useSaveAccountMutation = () =>
  useFinanceMutation(({ id, ...body }: AccountPayload & { id?: string }) =>
    id
      ? putRequest<BankAccountRow>(`/v1/finance/accounts/${id}`, body)
      : postRequest<BankAccountRow>('/v1/finance/accounts', body),
  );
export const useToggleAccountMutation = () =>
  useFinanceMutation((id: string) =>
    postRequest<BankAccountRow>(`/v1/finance/accounts/${id}/toggle`),
  );
export const useTransferMutation = () =>
  useFinanceMutation((body: AccountTransferPayload) =>
    postRequest<{ id: string; no: string }>('/v1/finance/transfers', body),
  );
export const useSampleStatementMutation = () =>
  useMutation({
    mutationFn: (accountId: string) =>
      getRequest<{ fileName: string; text: string }>(
        `/v1/finance/accounts/${accountId}/sample-statement`,
      ),
  });
export const useUploadStatementMutation = () =>
  useFinanceMutation(
    ({ accountId, ...body }: { accountId: string; fileName: string; text: string }) =>
      postRequest<StatementView>(`/v1/finance/accounts/${accountId}/statements`, body),
  );
export const useStatementQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.statement(toValue(id))),
    queryFn: () => getRequest<StatementView>(`/v1/finance/statements/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });
export const useUpdateStatementLineMutation = () =>
  useFinanceMutation(
    ({
      id,
      lineId,
      ...body
    }: {
      id: string;
      lineId: string;
      paymentId?: string | null;
      ignore?: boolean;
    }) => putRequest<StatementView>(`/v1/finance/statements/${id}/lines/${lineId}`, body),
  );
export const useConfirmStatementMutation = () =>
  useFinanceMutation(({ id, lineIds }: { id: string; lineIds?: string[] }) =>
    postRequest<StatementView>(`/v1/finance/statements/${id}/confirm`, { lineIds }),
  );

/* ---------------- Expenses & vendors ---------------- */

export const useExpensesQuery = (params: MaybeRefOrGetter<ExpenseQuery>) =>
  useQuery({
    queryKey: computed(() => k.expenses(q(params))),
    queryFn: () => getRequest<ExpenseList>('/v1/finance/expenses', { params: q(params) }),
    placeholderData: keepPreviousData,
  });
export const useExpenseQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.expense(toValue(id))),
    queryFn: () => getRequest<ExpenseDetail>(`/v1/finance/expenses/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });
export const useSaveExpenseMutation = () =>
  useFinanceMutation(({ id, ...body }: ExpensePayload & { id?: string }) =>
    id
      ? putRequest<ExpenseDetail>(`/v1/finance/expenses/${id}`, body)
      : postRequest<ExpenseDetail>('/v1/finance/expenses', body),
  );
const ex = (id: string, action: string) => `/v1/finance/expenses/${id}/${action}`;
export const useSubmitExpenseMutation = () =>
  useFinanceMutation((id: string) => postRequest<ExpenseDetail>(ex(id, 'submit')));
export const useApproveExpenseMutation = () =>
  useFinanceMutation((id: string) => postRequest<ExpenseDetail>(ex(id, 'approve')));
export const useRejectExpenseMutation = () =>
  useFinanceMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<ExpenseDetail>(ex(id, 'reject'), { reason }),
  );
export const usePayExpenseMutation = () =>
  useFinanceMutation(({ id, ...body }: PayExpensePayload & { id: string }) =>
    postRequest<ExpenseDetail>(ex(id, 'pay'), body),
  );
export const useAddExpenseCategoryMutation = () =>
  useFinanceMutation((name: string) =>
    postRequest<string[]>('/v1/finance/expenses/categories', { name }),
  );

export const useVendorsQuery = (
  params: MaybeRefOrGetter<{ search?: string; status?: string; category?: string }>,
) =>
  useQuery({
    queryKey: computed(() => k.vendors(q(params))),
    queryFn: () =>
      getRequest<{
        rows: VendorRow[];
        paid: number;
        outstanding: number;
        active: number;
        categories: string[];
        banks: string[];
      }>('/v1/finance/vendors', { params: q(params) }),
    placeholderData: keepPreviousData,
  });
export const useVendorQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.vendor(toValue(id))),
    queryFn: () => getRequest<VendorDetail>(`/v1/finance/vendors/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });
export const useSaveVendorMutation = () =>
  useFinanceMutation(({ id, ...body }: VendorPayload & { id?: string }) =>
    id
      ? putRequest<VendorDetail>(`/v1/finance/vendors/${id}`, body)
      : postRequest<VendorDetail>('/v1/finance/vendors', body),
  );
export const useToggleVendorMutation = () =>
  useFinanceMutation((id: string) => postRequest<VendorDetail>(`/v1/finance/vendors/${id}/toggle`));
