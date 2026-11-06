<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import {
  BanIcon,
  CreditCardIcon,
  DownloadIcon,
  EyeIcon,
  LifeBuoyIcon,
  RotateCcwIcon,
  UsersIcon,
} from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import { useSchoolsQuery, useSendRenewalRemindersMutation } from '@/api/services/schools';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { NIGERIAN_STATES, PLAN_NAMES } from '@/config/options';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import type { PlanName, School, SchoolStatus } from '@/types';

import { useSchoolActions } from './components/useSchoolActions';

const STATUSES = [
  'All',
  'Active',
  'Onboarding',
  'Expiring',
  'Grace period',
  'Restricted',
  'Suspended',
  'Expired',
] as const;

const status = useRouteQuery<string>('status', 'All');
const plan = useRouteQuery<string>('plan', '');
const state = useRouteQuery<string>('state', '');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
watch(debouncedSearch, () => (page.value = '1'));

const { data, isPending } = useSchoolsQuery(() => ({
  status: status.value === 'All' ? undefined : (status.value as SchoolStatus),
  plan: (plan.value || undefined) as PlanName | undefined,
  state: state.value || undefined,
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const rows = computed(() => data.value?.data ?? []);
const selection = useSelection(rows, (s) => s.id);
const { suspend, reactivate } = useSchoolActions();
const reminders = useSendRenewalRemindersMutation();

const tabs = computed(() =>
  STATUSES.map((s) => ({
    label: s,
    to: { query: s === 'All' ? {} : { status: s } },
    active: status.value === s,
  })),
);

const columns: Column[] = [
  { key: 'name', label: 'School', width: 'minmax(220px,1.8fr)' },
  { key: 'type', label: 'Type' },
  { key: 'state', label: 'State' },
  { key: 'plan', label: 'Plan' },
  { key: 'branches', label: 'Branches', align: 'right', width: '80px' },
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'renews', label: 'Renews' },
  { key: 'status', label: 'Status', width: '120px' },
];

const { schools: r } = routesPath;
const rowActions = (school: School): RowAction[] => [
  { label: 'View details', icon: EyeIcon, to: { name: r.detail.name, params: { id: school.id } } },
  {
    label: 'Manage subscription',
    icon: CreditCardIcon,
    to: { name: r.subscription.name, params: { id: school.id } },
  },
  {
    label: 'Administrators',
    icon: UsersIcon,
    to: { name: r.administrators.name, params: { id: school.id } },
  },
  {
    label: 'Create support issue',
    icon: LifeBuoyIcon,
    to: { name: routesPath.support.create.name, query: { school: school.id } },
  },
  school.status === 'Suspended'
    ? { label: 'Reactivate school', icon: RotateCcwIcon, onSelect: () => reactivate(school) }
    : {
        label: 'Suspend school',
        icon: BanIcon,
        destructive: true,
        onSelect: () => suspend([school]),
      },
];

function exportSchools(list: School[], filename = 'schools.csv') {
  downloadCsv(
    filename,
    [
      'School',
      'Type',
      'State',
      'Plan',
      'Branches',
      'Students',
      'Renews',
      'Status',
      'Administrator',
    ],
    list.map((s) => [
      s.name,
      s.type,
      s.state,
      s.plan,
      s.branches,
      s.students,
      s.renews,
      s.status,
      s.admin,
    ]),
  );
  toast.success(`Exported ${list.length} ${list.length === 1 ? 'school' : 'schools'}.`);
}

async function sendReminders() {
  const result = await reminders.mutateAsync(selection.selectedRows().map((s) => s.id));
  toast.success(`Renewal reminders queued for ${result.queued} schools.`);
  selection.clear();
}
</script>

<template>
  <PageHeader
    title="Schools"
    :description="`${formatCount(data?.meta.total ?? 0)} tenants match this view`"
  >
    <template #actions>
      <Button as-child
        ><RouterLink :to="{ name: r.provision.name }">Provision school</RouterLink></Button
      >
    </template>
  </PageHeader>
  <TabNav :tabs="tabs" label="School status" />
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(s) => s.id"
    :row-label="(s) => s.name"
    :actions="rowActions"
    :loading="isPending"
    :selection="selection"
    :meta="data?.meta"
    min-width="1060px"
    empty-text="No schools match these filters. Clear the filters or choose another status."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search by school, admin or state"
    /></template>
    <template #filters>
      <FilterMenu v-model="plan" label="Plan" :options="PLAN_NAMES" />
      <FilterMenu v-model="state" label="State" :options="NIGERIAN_STATES" />
    </template>
    <template #toolbar>
      <Button variant="outline" class="h-9" :disabled="!rows.length" @click="exportSchools(rows)"
        ><DownloadIcon />Export CSV</Button
      >
    </template>
    <template #bulk>
      <Button
        variant="outline"
        size="xs"
        class="h-7 border-[#E0C9A6]"
        @click="exportSchools(selection.selectedRows(), 'schools-selected.csv')"
        >Export selected</Button
      >
      <Button
        variant="outline"
        size="xs"
        class="h-7 border-[#E0C9A6]"
        :disabled="reminders.isPending.value"
        @click="sendReminders"
        >Send renewal reminder</Button
      >
      <Button
        variant="outline"
        size="xs"
        class="h-7 border-[#E0C9A6]"
        @click="suspend(selection.selectedRows())"
        >Suspend</Button
      >
    </template>
    <template #cell-name="{ row }">
      <CellLink
        :to="{ name: r.detail.name, params: { id: row.id } }"
        :label="row.name"
        :detail="`Admin: ${row.admin}`"
      />
    </template>
    <template #cell-students="{ row }">{{ formatCount(row.students) }}</template>
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
</template>
