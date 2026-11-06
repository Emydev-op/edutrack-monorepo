<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CopyIcon, PencilIcon, SchoolIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { usePlansQuery } from '@/api/services/plans';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { PLAN_NAMES } from '@/config/options';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { routesPath } from '@/router/routes-path';
import type { Plan, PlanStatus } from '@/types';

import {
  limitText,
  OPTIONAL_MODULE_TOTAL,
  optionalModuleCount,
  PLAN_STATUS_TONE,
  portalNames,
  priceText,
} from './plan-format';

const STATUSES = ['All', 'Active', 'Draft', 'Archived'] as const;
const { plans: r } = routesPath;

const { data: plans, isPending } = usePlansQuery();
const status = useRouteQuery<string>('status', 'All');
const search = ref('');

const tabs = computed(() =>
  STATUSES.map((s) => ({
    label: `${s} · ${s === 'All' ? (plans.value?.length ?? 0) : (plans.value ?? []).filter((p) => p.status === s).length}`,
    to: { query: s === 'All' ? {} : { status: s } },
    active: status.value === s,
  })),
);

const rows = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (plans.value ?? []).filter(
    (p) =>
      (status.value === 'All' || p.status === status.value) &&
      (!term || `${p.name} ${p.description}`.toLowerCase().includes(term)),
  );
});

const emptyText = computed(() => {
  if (search.value.trim()) return 'No plans match your search.';
  if (status.value === 'Draft')
    return 'No draft plans. Plans you create start as drafts until you publish them.';
  return `No ${status.value.toLowerCase()} plans. Change the filter to see other plans.`;
});

const columns: Column[] = [
  { key: 'name', label: 'Plan', width: 'minmax(200px,1.3fr)' },
  { key: 'price', label: 'Price', width: 'minmax(180px,1.2fr)' },
  { key: 'students', label: 'Students', width: '100px' },
  { key: 'branches', label: 'Branches', width: '90px' },
  { key: 'modules', label: 'Modules', width: 'minmax(110px,0.7fr)' },
  { key: 'portals', label: 'Portals', width: 'minmax(150px,1fr)' },
  { key: 'status', label: 'Status', width: '110px' },
];

const actions = (plan: Plan): RowAction[] => [
  { label: 'Edit plan', icon: PencilIcon, to: { name: r.detail.name, params: { id: plan.id } } },
  { label: 'Duplicate', icon: CopyIcon, to: { name: r.create.name, query: { from: plan.id } } },
  ...((PLAN_NAMES as readonly string[]).includes(plan.name)
    ? [
        {
          label: 'View schools on this plan',
          icon: SchoolIcon,
          to: { name: routesPath.schools.list.name, query: { plan: plan.name } },
        },
      ]
    : []),
];
</script>

<template>
  <PageHeader
    title="Plans"
    description="What schools can subscribe to. Only Active plans are offered when provisioning."
  >
    <template #actions>
      <Button as-child><RouterLink :to="{ name: r.create.name }">Create plan</RouterLink></Button>
    </template>
  </PageHeader>
  <TabNav :tabs="tabs" label="Plan status" />
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(p) => p.id"
    :row-label="(p) => p.name"
    :actions="actions"
    :loading="isPending"
    :empty-text="emptyText"
  >
    <template #search><SearchInput v-model="search" placeholder="Search plans" /></template>
    <template #cell-name="{ row }">
      <span class="flex min-w-0 flex-col">
        <CellLink :to="{ name: r.detail.name, params: { id: row.id } }" :label="row.name" />
        <span v-if="row.description" class="text-xs text-faint">{{ row.description }}</span>
      </span>
    </template>
    <template #cell-price="{ row }">
      <span class="flex flex-col">
        <span>{{ priceText(row.pricing) }}</span>
        <span v-if="row.trialDays" class="text-xs text-faint">{{ row.trialDays }}-day trial</span>
      </span>
    </template>
    <template #cell-students="{ row }">{{ limitText(row, 'students') }}</template>
    <template #cell-branches="{ row }">{{ limitText(row, 'branches') }}</template>
    <template #cell-modules="{ row }">
      <span class="flex flex-col">
        <span>{{ optionalModuleCount(row.modules) }} of {{ OPTIONAL_MODULE_TOTAL }}</span>
        <span class="text-xs text-faint">+ core</span>
      </span>
    </template>
    <template #cell-portals="{ row }">{{ portalNames(row.modules).join(', ') || 'None' }}</template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" :tone="PLAN_STATUS_TONE[row.status as PlanStatus]" />
    </template>
  </DataTable>
</template>
