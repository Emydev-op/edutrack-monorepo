<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CreditCardIcon, EyeIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import { useSubscriptionsQuery } from '@/api/services/subscriptions';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { PLAN_NAMES } from '@/config/options';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { routesPath } from '@/router/routes-path';
import type { SubscriptionRow, SubscriptionStatus } from '@/types';

const STATUSES = [
  'All',
  'Active',
  'Expiring',
  'Grace period',
  'Restricted',
  'Expired',
  'Cancelled',
] as const;

const status = useRouteQuery<string>('status', 'All');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const plan = ref('');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
watch(debouncedSearch, () => (page.value = '1'));

const { data, isPending } = useSubscriptionsQuery(() => ({
  status: status.value === 'All' ? undefined : (status.value as SubscriptionStatus),
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
// Plan is a light client-side refinement of the current page.
const rows = computed(() =>
  (data.value?.data ?? []).filter((r) => !plan.value || r.plan === plan.value),
);

const tabs = computed(() =>
  STATUSES.map((s) => ({
    label: s,
    to: { query: s === 'All' ? {} : { status: s } },
    active: status.value === s,
  })),
);
const columns: Column[] = [
  { key: 'schoolName', label: 'School', width: 'minmax(200px,1.6fr)' },
  { key: 'plan', label: 'Plan' },
  { key: 'studentUsage', label: 'Student usage', width: '140px' },
  { key: 'branchUsage', label: 'Branches' },
  { key: 'renews', label: 'Renews' },
  { key: 'billing', label: 'Billing' },
  { key: 'status', label: 'Status', width: '120px' },
];
const actions = (row: SubscriptionRow): RowAction[] => [
  {
    label: 'Manage subscription',
    icon: CreditCardIcon,
    to: { name: routesPath.schools.subscription.name, params: { id: row.schoolId } },
  },
  {
    label: 'View school',
    icon: EyeIcon,
    to: { name: routesPath.schools.detail.name, params: { id: row.schoolId } },
  },
];
</script>

<template>
  <PageHeader
    title="Subscriptions"
    description="Active → Expiring → Grace period → Restricted. Restricted schools keep sign-in, read access, exports and billing."
  />
  <TabNav :tabs="tabs" label="Subscription status" />
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(r) => r.schoolId"
    :row-label="(r) => r.schoolName"
    :actions="actions"
    :loading="isPending"
    :meta="data?.meta"
    empty-text="No subscriptions with this status right now."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search><SearchInput v-model="search" placeholder="Search schools" /></template>
    <template #filters><FilterMenu v-model="plan" label="Plan" :options="PLAN_NAMES" /></template>
    <template #cell-schoolName="{ row }">
      <CellLink
        :to="{ name: routesPath.schools.detail.name, params: { id: row.schoolId } }"
        :label="row.schoolName"
      />
    </template>
    <template #cell-billing="{ row }"><StatusBadge :label="row.billing" /></template>
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
</template>
