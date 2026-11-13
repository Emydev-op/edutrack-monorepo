<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useExpensesQuery, useFinanceOptionsQuery } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ExpenseRow, ExpenseStatus } from '@/types';

import { compactNaira, financeTone, fmtDay } from '../finance-tones';
import ExpenseDrawer from './ExpenseDrawer.vue';

const route = useRoute();
const router = useRouter();
const context = useContextStore();
const { data: options } = useFinanceOptionsQuery();

const status = useRouteQuery<ExpenseStatus | 'All'>('status', 'All');
const category = useRouteQuery<string>('category', '');
const vendor = useRouteQuery<string>('vendor', '');
const page = useRouteQuery<string>('page', '1');
const range = ref<DateRangeValue>({});
const search = ref('');
const debounced = refDebounced(search, 300);
const pageSize = ref(20);
watch([debounced, range, pageSize], () => (page.value = '1'));

const branch = computed(() => (context.singleBranch ? undefined : context.current.branch));
const { data, isPending } = useExpensesQuery(() => ({
  status: status.value === 'All' ? undefined : status.value,
  category: category.value || undefined,
  vendor: vendor.value || undefined,
  branch: branch.value,
  from: range.value.from,
  to: range.value.to,
  search: debounced.value || undefined,
  page: Number(page.value),
  pageSize: pageSize.value,
}));

const drawerOpen = ref(route.query.new === '1');
watch(drawerOpen, (o) => {
  if (!o && route.query.new) void router.replace({ query: { ...route.query, new: undefined } });
});

const STATUSES: (ExpenseStatus | 'All')[] = [
  'All',
  'Draft',
  'Submitted',
  'Approved',
  'Paid',
  'Rejected',
];
const statusOptions = computed(() =>
  STATUSES.map((s) => ({
    value: s,
    label: `${s}${data.value ? ` ${data.value.summary.counts[s]}` : ''}`,
  })),
);

const vendorName = computed(
  () => options.value?.vendors.find((v) => v.id === vendor.value)?.name ?? '',
);
const vendorFilter = computed({
  get: () => vendorName.value,
  set: (name: string) =>
    (vendor.value = options.value?.vendors.find((v) => v.name === name)?.id ?? ''),
});

const maxCategory = computed(() =>
  Math.max(1, ...(data.value?.summary.byCategory.map((c) => c.amount) ?? [])),
);

const columns = computed<Column[]>(() => [
  { key: 'no', label: 'Expense', width: 'minmax(220px,2fr)' },
  { key: 'category', label: 'Category', width: 'minmax(110px,1fr)' },
  { key: 'vendor', label: 'Vendor', width: 'minmax(150px,1.3fr)' },
  ...(context.singleBranch ? [] : [{ key: 'branch', label: 'Branch', width: '120px' }]),
  { key: 'date', label: 'Date', width: '110px' },
  { key: 'amount', label: 'Amount', align: 'right' as const, width: '120px' },
  { key: 'status', label: 'Status', width: 'minmax(150px,1fr)' },
]);

const link = (e: ExpenseRow) => ({
  name: routesPath.finance.expenseDetail.name,
  params: { id: e.id },
});
const filtered = computed(
  () =>
    status.value !== 'All' ||
    !!category.value ||
    !!vendor.value ||
    !!debounced.value ||
    !!range.value.from,
);
</script>

<template>
  <PageHeader
    title="Expenses"
    :description="`Draft → Submitted → Approved → Paid · ${context.current.session} · ${context.current.branch}`"
  >
    <template #actions>
      <Button @click="drawerOpen = true">New expense</Button>
    </template>
  </PageHeader>

  <MetricGrid>
    <MetricCard
      label="Paid"
      :value="data ? compactNaira(data.summary.paid) : undefined"
      :loading="!data"
      hint="Money already out"
    />
    <MetricCard
      label="Approved, not paid"
      :value="data ? compactNaira(data.summary.approvedUnpaid) : undefined"
      :loading="!data"
      :hint="data?.summary.approvedUnpaid ? 'Owed to vendors' : 'Nothing owed'"
      :hint-tone="data?.summary.approvedUnpaid ? 'warning' : 'neutral'"
      :to="{ query: { status: 'Approved' } }"
    />
    <MetricCard
      label="Awaiting approval"
      :value="data ? compactNaira(data.summary.awaitingApproval) : undefined"
      :loading="!data"
      :hint="
        data
          ? `${data.summary.awaitingCount} expense${data.summary.awaitingCount === 1 ? '' : 's'}`
          : ''
      "
      :hint-tone="data?.summary.awaitingCount ? 'warning' : 'neutral'"
      :to="{ query: { status: 'Submitted' } }"
    />
    <MetricCard
      label="Drafts"
      :value="data?.summary.drafts"
      :loading="!data"
      hint="Not yet submitted"
      :to="{ query: { status: 'Draft' } }"
    />
  </MetricGrid>

  <SectionCard
    v-if="data?.summary.byCategory.length"
    title="Paid by category"
    description="Where the money went, for the expenses in view"
  >
    <div class="flex flex-col gap-1">
      <MeterRow
        v-for="c in data.summary.byCategory.slice(0, 8)"
        :key="c.category"
        :label="c.category"
        :percent="Math.round((c.amount / maxCategory) * 100)"
        :value="compactNaira(c.amount)"
        color="var(--primary)"
        :to="{ query: { ...route.query, category: c.category, page: undefined } }"
      />
    </div>
  </SectionCard>

  <SegmentedControl v-model="status" label="Expense status" :options="statusOptions" />

  <DataTable
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(e) => e.id"
    :row-label="(e) => e.description"
    :loading="isPending"
    :meta="data?.meta"
    min-width="900px"
    :empty-text="
      filtered
        ? 'No expenses match. Clear the search or filters.'
        : 'No expenses yet. Record one with New expense.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = $event"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Expense no., description or vendor"
    /></template>
    <template #filters>
      <FilterMenu
        v-model="category"
        label="Category"
        :options="data?.categories ?? options?.expenseCategories ?? []"
      />
      <FilterMenu
        v-model="vendorFilter"
        label="Vendor"
        :options="options?.vendors.map((v) => v.name) ?? []"
      />
      <DateRangeFilter v-model="range" />
    </template>
    <template #cell-no="{ row }">
      <CellLink :to="link(row)" :label="row.description" :detail="row.no" />
    </template>
    <template #cell-vendor="{ row }">
      <CellLink
        v-if="row.vendorId"
        :to="{ name: routesPath.finance.vendorDetail.name, params: { id: row.vendorId } }"
        :label="row.vendor ?? ''"
      />
      <span v-else class="text-faint">—</span>
    </template>
    <template #cell-date="{ row }">{{ fmtDay(row.date) }}</template>
    <template #cell-amount="{ row }"
      ><span class="font-medium tabular-nums">{{ formatNaira(row.amount) }}</span></template
    >
    <template #cell-status="{ row }">
      <span class="flex flex-col gap-0.5">
        <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
        <span v-if="row.waitingOn" class="text-xs text-faint">Waiting for {{ row.waitingOn }}</span>
      </span>
    </template>
  </DataTable>

  <ExpenseDrawer v-model:open="drawerOpen" />
</template>
