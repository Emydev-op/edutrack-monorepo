<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { EyeIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';

import { useUsersQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import type { SchoolUserRow } from '@/types';

import { accountTone } from '../user-tones';

const { data, isPending } = useUsersQuery();
const search = ref('');
const status = ref('');

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value ?? [])
    .filter((u) => !['Invited', 'Revoked'].includes(u.status))
    .filter((u) => !status.value || u.status === status.value)
    .filter(
      (u) =>
        !q || `${u.name} ${u.email} ${u.position} ${u.roles.join(' ')}`.toLowerCase().includes(q),
    );
});

const userLink = (u: SchoolUserRow) => ({
  name: routesPath.school.user.name,
  params: { id: u.id },
});
const actions = (u: SchoolUserRow): RowAction[] => [
  { label: 'View user', icon: EyeIcon, to: userLink(u) },
];

const columns: Column[] = [
  { key: 'name', label: 'User', width: 'minmax(220px,1.6fr)' },
  { key: 'position', label: 'Position', width: 'minmax(150px,1.3fr)' },
  { key: 'roles', label: 'System roles', width: 'minmax(150px,1.3fr)' },
  { key: 'scope', label: 'Scope', width: 'minmax(120px,1fr)' },
  { key: 'status', label: 'Account', width: '110px' },
  { key: 'lastActive', label: 'Last active', width: '100px' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(u) => u.id"
    :row-label="(u) => u.name"
    :actions="actions"
    :loading="isPending"
    min-width="1000px"
    empty-text="No users match your search."
  >
    <template #search><SearchInput v-model="search" placeholder="Search users" /></template>
    <template #filters>
      <FilterMenu
        v-model="status"
        label="Account"
        :options="['Active', 'Suspended', 'Deactivated']"
      />
    </template>
    <template #cell-name="{ row }">
      <CellLink :to="userLink(row)" :label="row.name" />
      <span class="text-xs text-faint">{{ row.email }}</span>
    </template>
    <template #cell-roles="{ row }">{{ row.roles.join(', ') || 'None' }}</template>
    <template #cell-scope="{ row }">{{
      row.scope === 'School' ? 'Whole school' : row.branches.join(', ')
    }}</template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="accountTone(row.status)"
    /></template>
  </DataTable>
</template>
