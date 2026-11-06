<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CopyIcon, EyeIcon } from '@lucide/vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';

import { useRolesQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import type { Role } from '@/types';

const { data, isPending } = useRolesQuery();

const roleLink = (r: Role) => ({ name: routesPath.school.role.name, params: { id: r.id } });
const actions = (r: Role): RowAction[] => [
  { label: r.type === 'Custom' ? 'Edit role' : 'View role', icon: EyeIcon, to: roleLink(r) },
  {
    label: 'Duplicate',
    icon: CopyIcon,
    to: { name: routesPath.school.roleNew.name, query: { from: r.id } },
  },
];

const columns: Column[] = [
  { key: 'name', label: 'Role', width: 'minmax(160px,1.2fr)' },
  { key: 'type', label: 'Type', width: '120px' },
  { key: 'users', label: 'Users', align: 'right', width: '70px' },
  { key: 'scope', label: 'Default scope', width: '140px' },
  { key: 'description', label: 'Purpose', width: 'minmax(240px,2fr)' },
];
</script>

<template>
  <DataTable
    title="Roles"
    description="A user can hold several roles. Scope limits where each role applies. Predefined roles can be duplicated to customise."
    :columns="columns"
    :rows="data ?? []"
    :row-key="(r) => r.id"
    :row-label="(r) => r.name"
    :actions="actions"
    :loading="isPending"
    min-width="900px"
  >
    <template #cell-name="{ row }"><CellLink :to="roleLink(row)" :label="row.name" /></template>
    <template #cell-type="{ row }"
      ><StatusBadge :label="row.type" :tone="row.type === 'Custom' ? 'brand' : 'neutral'"
    /></template>
  </DataTable>
</template>
