<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { CheckIcon, EyeIcon, Paperclip, XIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  usePaymentsQuery,
  useRefundsQuery,
  useRejectPaymentMutation,
  useVerifyPaymentMutation,
  useVerifyPaymentsMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { PaymentMethod, PaymentRow, PaymentSource, PaymentStatus, RefundRow } from '@/types';

import { financeTone, fmtDay } from '../finance-tones';

type Tab = 'all' | 'pending' | 'refunds';

const f = routesPath.finance;
const route = useRoute();
const confirm = useConfirm();
const context = useContextStore();
const verify = useVerifyPaymentMutation();
const verifyMany = useVerifyPaymentsMutation();
const reject = useRejectPaymentMutation();

const tab = useRouteQuery<Tab>('tab', 'all');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const method = ref('');
const status = ref('');
const source = ref('');
const range = ref<DateRangeValue>({});
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const debounced = refDebounced(search, 300);
watch([debounced, method, status, source, range, tab], () => (page.value = '1'));

const branch = computed(() => context.current.branch);
const { data, isPending } = usePaymentsQuery(() => ({
  tab: tab.value === 'pending' ? 'pending' : 'all',
  search: debounced.value || undefined,
  method: (method.value || undefined) as PaymentMethod | undefined,
  status: tab.value === 'pending' ? undefined : ((status.value || undefined) as PaymentStatus),
  source: (source.value === 'Recorded by staff' ? 'School' : source.value || undefined) as
    PaymentSource | undefined,
  from: range.value.from,
  to: range.value.to,
  branch: branch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const { data: refunds, isPending: refundsLoading } = useRefundsQuery(() => ({
  branch: branch.value,
}));

const rows = computed(() => data.value?.data ?? []);
const selection = useSelection(rows, (p) => p.id);
watch([tab, debounced, method, source, range], () => selection.clear());

const tabs = computed(() => [
  { label: 'All payments', to: { query: { tab: undefined } }, active: tab.value === 'all' },
  {
    label: 'Awaiting verification',
    to: { query: { tab: 'pending' } },
    active: tab.value === 'pending',
    count: data.value?.summary.pendingCount,
  },
  {
    label: 'Refunds',
    to: { query: { tab: 'refunds' } },
    active: tab.value === 'refunds',
    count: refunds.value?.awaiting || undefined,
  },
]);

const filtered = computed(
  () =>
    !!debounced.value || !!method.value || !!status.value || !!source.value || !!range.value.from,
);

const receiptLink = (p: { id: string }) => ({ name: f.paymentDetail.name, params: { id: p.id } });
const studentLink = (p: { studentKey: string }) => ({
  name: f.studentAccount.name,
  params: { key: p.studentKey },
});

function askVerify(p: PaymentRow) {
  void confirm({
    title: `Verify ${p.no}?`,
    description: 'Only verify once you’ve found this money on the school’s bank statement.',
    details: [
      ['Amount', formatNaira(p.amount)],
      ['Student', p.student],
      ['Reference', p.reference || '—'],
      ['Effect', 'Balance goes down and a receipt is sent to the payer'],
    ],
    confirmLabel: 'Verify payment',
    action: async () => {
      await verify.mutateAsync(p.id);
      toast.success(`${p.no} verified. ${p.student}’s balance is updated.`);
    },
  });
}

function askReject(p: PaymentRow) {
  void confirm({
    title: `Reject ${p.no}?`,
    description:
      'Use this when the money isn’t on the bank statement. The payer is asked to resend proof.',
    details: [
      ['Amount', formatNaira(p.amount)],
      ['Payer', p.payer],
      ['Effect', 'No balance change. It stays on record as Rejected.'],
    ],
    options: [
      { value: 'Not found on the bank statement', label: 'Not found on the bank statement' },
      {
        value: 'Amount on the statement is different',
        label: 'Amount on the statement is different',
      },
      {
        value: 'Duplicate of a payment already recorded',
        label: 'Duplicate of a payment already recorded',
      },
      { value: 'other', label: 'Another reason' },
    ],
    input: {
      label: 'Note for the payer (optional)',
      placeholder: 'e.g. Please send the bank alert',
    },
    confirmLabel: 'Reject payment',
    tone: 'destructive',
    action: async ({ option, text }) => {
      const reason =
        option === 'other'
          ? text.trim() || 'Not accepted'
          : text.trim()
            ? `${option}. ${text.trim()}`
            : option;
      await reject.mutateAsync({ id: p.id, reason });
      toast.success(`${p.no} rejected.`);
    },
  });
}

async function verifySelected() {
  const list = selection.selectedRows();
  const total = list.reduce((n, p) => n + p.amount, 0);
  void confirm({
    title: `Verify ${list.length} payment${list.length === 1 ? '' : 's'}?`,
    description: 'Only verify transfers you’ve found on the bank statement.',
    details: [['Total', formatNaira(total)]],
    confirmLabel: 'Verify selected',
    action: async () => {
      try {
        const r = await verifyMany.mutateAsync(list.map((p) => p.id));
        toast.success(
          `${r.verified} payment${r.verified === 1 ? '' : 's'} verified · ${formatNaira(r.total)}.`,
        );
        selection.clear();
      } catch (e) {
        throw new Error(getApiErrorMessage(e, 'We couldn’t verify those payments.'));
      }
    },
  });
}

const allActions = (p: PaymentRow): RowAction[] => [
  { label: 'View receipt', icon: EyeIcon, to: receiptLink(p) },
  ...(p.status === 'Pending verification'
    ? [
        { label: 'Verify', icon: CheckIcon, onSelect: () => askVerify(p) },
        { label: 'Reject', icon: XIcon, onSelect: () => askReject(p) },
      ]
    : []),
];

const allColumns: Column[] = [
  { key: 'no', label: 'Receipt', width: 'minmax(130px,1fr)' },
  { key: 'payer', label: 'Payer', width: 'minmax(160px,1.2fr)' },
  { key: 'student', label: 'Student', width: 'minmax(170px,1.3fr)' },
  { key: 'method', label: 'Method', width: 'minmax(150px,1.2fr)' },
  { key: 'account', label: 'Account', width: 'minmax(150px,1.1fr)' },
  { key: 'date', label: 'Date', width: '110px' },
  { key: 'amount', label: 'Amount', align: 'right', width: '120px' },
  { key: 'status', label: 'Status', width: 'minmax(150px,1fr)' },
];
const pendingColumns: Column[] = [
  { key: 'no', label: 'Receipt', width: 'minmax(130px,1fr)' },
  { key: 'payer', label: 'Payer · student', width: 'minmax(200px,1.6fr)' },
  { key: 'source', label: 'Source', width: 'minmax(140px,1fr)' },
  { key: 'method', label: 'Bank · reference', width: 'minmax(170px,1.3fr)' },
  { key: 'date', label: 'Date', width: '110px' },
  { key: 'amount', label: 'Amount', align: 'right', width: '120px' },
  { key: 'decide', label: '', align: 'right', width: '170px' },
];
const refundColumns: Column[] = [
  { key: 'no', label: 'Refund', width: 'minmax(120px,1fr)' },
  { key: 'student', label: 'Student', width: 'minmax(170px,1.3fr)' },
  { key: 'paymentNo', label: 'Original payment', width: 'minmax(140px,1fr)' },
  { key: 'amount', label: 'Amount', align: 'right', width: '120px' },
  { key: 'reason', label: 'Reason', width: 'minmax(200px,1.6fr)' },
  { key: 'requested', label: 'Requested', width: 'minmax(150px,1.1fr)' },
  { key: 'approvedBy', label: 'Approved by', width: 'minmax(140px,1fr)' },
  { key: 'status', label: 'Status', width: 'minmax(150px,1fr)' },
];
const refundLink = (r: RefundRow) => ({ name: f.refundDetail.name, params: { id: r.id } });
</script>

<template>
  <PageHeader
    title="Payments"
    description="Payments are never deleted; mistakes are corrected with a refund or by rejecting an unverified transfer."
  >
    <template #actions>
      <Button as-child
        ><RouterLink :to="{ name: f.paymentNew.name }">Record payment</RouterLink></Button
      >
    </template>
  </PageHeader>

  <MetricGrid v-if="data">
    <MetricCard
      label="Confirmed"
      :value="formatNaira(data.summary.confirmed)"
      :hint="`${data.summary.confirmedCount.toLocaleString('en-NG')} payments`"
    />
    <MetricCard
      label="Awaiting verification"
      :value="formatNaira(data.summary.pending)"
      :hint="`${data.summary.pendingCount} transfer${data.summary.pendingCount === 1 ? '' : 's'}`"
      :hint-tone="data.summary.pendingCount ? 'warning' : 'neutral'"
      :to="{ query: { tab: 'pending' } }"
    />
    <MetricCard label="Received today" :value="formatNaira(data.summary.today)" hint="Confirmed" />
    <MetricCard
      label="Rejected"
      :value="String(data.summary.rejectedCount)"
      hint="Claims not found on the statement"
    />
  </MetricGrid>

  <TabNav :tabs="tabs" label="Payments" />

  <!-- Awaiting verification -->
  <template v-if="tab === 'pending'">
    <InlineNotice
      tone="info"
      title="Parents tap “I’ve made a payment” in the Parent Portal"
      description="Their claim, and any transfer staff record without checking the statement, waits here. Nothing changes a balance until you verify it against the bank statement."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: f.accounts.name }">Match a bank statement</RouterLink></Button
        >
      </template>
    </InlineNotice>
    <DataTable
      :columns="pendingColumns"
      :rows="rows"
      :row-key="(p) => p.id"
      :row-label="(p) => p.no"
      :selection="selection"
      :loading="isPending"
      :meta="data?.meta"
      min-width="1000px"
      :empty-text="
        filtered ? 'Nothing matches the search.' : 'Nothing is waiting for verification.'
      "
      @update:page="page = String($event)"
      @update:page-size="pageSize = String($event)"
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Receipt, payer, student or reference"
      /></template>
      <template #filters>
        <FilterMenu
          v-model="source"
          label="Source"
          :options="['Parent claim', 'Recorded by staff']"
        />
      </template>
      <template #bulk>
        <Button size="sm" :disabled="verifyMany.isPending.value" @click="verifySelected"
          >Verify selected</Button
        >
      </template>
      <template #cell-no="{ row }"><CellLink :to="receiptLink(row)" :label="row.no" /></template>
      <template #cell-payer="{ row }">
        <span class="flex flex-col">
          <span>{{ row.payer }}</span>
          <RouterLink :to="studentLink(row)" class="text-xs text-faint hover:underline"
            >{{ row.student }} · {{ row.className }}</RouterLink
          >
        </span>
      </template>
      <template #cell-source="{ row }">
        <span class="flex flex-col gap-0.5">
          <StatusBadge
            :label="row.source === 'Parent claim' ? 'Parent claim' : 'Recorded by staff'"
            :tone="row.source === 'Parent claim' ? 'brand' : 'neutral'"
          />
          <span v-if="row.source !== 'Parent claim'" class="text-xs text-faint">{{
            row.recordedBy
          }}</span>
        </span>
      </template>
      <template #cell-method="{ row }">
        <span class="flex flex-col">
          <span>{{ row.method }}</span>
          <span class="text-xs text-faint">ref {{ row.reference || 'not given' }}</span>
        </span>
      </template>
      <template #cell-date="{ row }">{{ fmtDay(row.date, false) }}</template>
      <template #cell-amount="{ row }"
        ><span class="font-medium tabular-nums">{{ formatNaira(row.amount) }}</span></template
      >
      <template #cell-decide="{ row }">
        <span class="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" @click="askReject(row)">Reject</Button>
          <Button size="sm" @click="askVerify(row)">Verify</Button>
        </span>
      </template>
    </DataTable>
    <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Paperclip class="size-3.5" /> Open a receipt to see the proof a parent attached.
    </p>
  </template>

  <!-- Refunds -->
  <template v-else-if="tab === 'refunds'">
    <InlineNotice
      tone="neutral"
      title="Refunds come out of credit on a student’s account"
      description="Overpayments, removed charges and cancelled invoices become credit. The Principal approves refunds up to the limit; larger ones need the Proprietor. The original payment never changes."
    />
    <p v-if="refunds" class="text-[13px] text-muted-foreground">
      {{ refunds.awaiting }} awaiting approval · {{ refunds.toPay }} approved, waiting to be paid
      out · {{ formatNaira(refunds.paid) }} paid out
    </p>
    <DataTable
      :columns="refundColumns"
      :rows="refunds?.rows ?? []"
      :row-key="(r) => r.id"
      :loading="refundsLoading"
      min-width="1100px"
      empty-text="No refunds yet."
    >
      <template #cell-no="{ row }"><CellLink :to="refundLink(row)" :label="row.no" /></template>
      <template #cell-student="{ row }">
        <CellLink :to="studentLink(row)" :label="row.student" :detail="row.payer" />
      </template>
      <template #cell-paymentNo="{ row }">{{ row.paymentNo ?? '—' }}</template>
      <template #cell-amount="{ row }"
        ><span class="font-medium tabular-nums">{{ formatNaira(row.amount) }}</span></template
      >
      <template #cell-requested="{ row }">
        <span class="flex flex-col">
          <span>{{ row.requestedBy }}</span>
          <span class="text-xs text-faint">{{ fmtDay(row.requestedOn) }}</span>
        </span>
      </template>
      <template #cell-approvedBy="{ row }">{{ row.approvedBy ?? '—' }}</template>
      <template #cell-status="{ row }">
        <span class="flex flex-col gap-0.5">
          <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
          <span v-if="row.status === 'Awaiting approval'" class="text-xs text-faint"
            >Needs the {{ row.needs }}</span
          >
        </span>
      </template>
    </DataTable>
  </template>

  <!-- All payments -->
  <DataTable
    v-else
    :columns="allColumns"
    :rows="rows"
    :row-key="(p) => p.id"
    :row-label="(p) => p.no"
    :actions="allActions"
    :loading="isPending"
    :meta="data?.meta"
    min-width="1200px"
    :empty-text="
      filtered ? 'No payments match. Clear the search or filters.' : 'No payments recorded yet.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Receipt, payer, student, reference or invoice"
    /></template>
    <template #filters>
      <FilterMenu
        v-model="method"
        label="Method"
        :options="['Bank transfer', 'POS', 'Cash', 'Cheque', 'Other']"
      />
      <FilterMenu
        v-model="status"
        label="Status"
        :options="['Confirmed', 'Pending verification', 'Rejected']"
      />
      <FilterMenu
        v-model="source"
        label="Source"
        :options="['Parent claim', 'Recorded by staff']"
      />
      <DateRangeFilter v-model="range" label="Date" />
    </template>
    <template #cell-no="{ row }"><CellLink :to="receiptLink(row)" :label="row.no" /></template>
    <template #cell-student="{ row }">
      <CellLink :to="studentLink(row)" :label="row.student" :detail="row.className" />
    </template>
    <template #cell-method="{ row }">
      <span class="flex flex-col">
        <span>{{ row.method }}</span>
        <span v-if="row.reference" class="truncate text-xs text-faint">{{ row.reference }}</span>
      </span>
    </template>
    <template #cell-date="{ row }">{{ fmtDay(row.date, false) }}</template>
    <template #cell-amount="{ row }"
      ><span class="font-medium tabular-nums">{{ formatNaira(row.amount) }}</span></template
    >
    <template #cell-status="{ row }">
      <span class="flex flex-col gap-0.5">
        <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
        <span v-if="row.source === 'Parent claim'" class="text-xs text-faint">Parent claim</span>
        <span v-if="row.unallocated && row.status === 'Confirmed'" class="text-xs text-faint"
          >{{ formatNaira(row.unallocated) }} credit</span
        >
        <span v-if="row.refunded" class="text-xs text-faint"
          >{{ formatNaira(row.refunded) }} refunded</span
        >
      </span>
    </template>
  </DataTable>
</template>
