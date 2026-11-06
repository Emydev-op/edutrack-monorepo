<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { EyeIcon, UsersIcon } from '@lucide/vue';

import { useOnboardingSchoolsQuery } from '@/api/services/dashboard';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { routesPath } from '@/router/routes-path';
import type { School } from '@/types';

const { data: schools, isPending } = useOnboardingSchoolsQuery();

const columns: Column[] = [
  { key: 'name', label: 'School', width: 'minmax(200px,1.5fr)' },
  { key: 'progress', label: 'Progress', width: '150px' },
  { key: 'currentStep', label: 'Current step' },
  { key: 'admin', label: 'Administrator', width: 'minmax(160px,1.2fr)' },
  { key: 'createdAt', label: 'Created' },
  { key: 'status', label: 'Status', width: '120px' },
];
const actions = (school: School): RowAction[] => [
  {
    label: 'View school',
    icon: EyeIcon,
    to: { name: routesPath.schools.detail.name, params: { id: school.id } },
  },
  {
    label: 'Administrators',
    icon: UsersIcon,
    to: { name: routesPath.schools.administrators.name, params: { id: school.id } },
  },
];
</script>

<template>
  <DataTable
    title="Onboarding health"
    description="Schools that have not finished setup"
    :columns="columns"
    :rows="schools ?? []"
    :row-key="(s) => s.id"
    :row-label="(s) => s.name"
    :actions="actions"
    :loading="isPending"
    empty-text="Every school has finished setup."
  >
    <template #cell-name="{ row }"
      ><span class="font-medium">{{ row.name }}</span></template
    >
    <template #cell-progress="{ row }">
      <span :class="row.setupProgress < 50 && 'text-warning-strong'"
        >{{ row.setupProgress }}% complete</span
      >
      <span class="text-xs text-faint">{{ row.setupProgress < 50 ? 'Behind' : 'On track' }}</span>
    </template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status === 'Active' ? 'In progress' : row.status"
    /></template>
  </DataTable>
</template>
