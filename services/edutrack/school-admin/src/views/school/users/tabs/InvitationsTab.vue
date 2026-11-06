<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { useUsersQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import type { SchoolUserRow } from '@/types';

import { accountTone, statusLabel } from '../user-tones';

const { data, isPending } = useUsersQuery();
const rows = computed(() =>
  (data.value ?? []).filter((u) => u.status === 'Invited' || u.status === 'Revoked'),
);
const userLink = (u: SchoolUserRow) => ({
  name: routesPath.school.user.name,
  params: { id: u.id },
});

const columns: Column[] = [
  { key: 'name', label: 'Invitee', width: 'minmax(220px,1.5fr)' },
  { key: 'roles', label: 'Roles', width: 'minmax(150px,1.2fr)' },
  { key: 'scope', label: 'Scope' },
  { key: 'invited', label: 'Sent', width: '110px' },
  { key: 'status', label: 'Status', width: '110px' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(u) => u.id"
    :loading="isPending"
    min-width="820px"
    empty-text="No pending invitations. Invite a staff member to give them access."
  >
    <template #cell-name="{ row }">
      <CellLink :to="userLink(row)" :label="row.name" />
      <span class="text-xs text-faint">{{ row.email }}</span>
    </template>
    <template #cell-roles="{ row }">{{ row.roles.join(', ') }}</template>
    <template #cell-scope="{ row }">{{
      row.scope === 'School' ? 'Whole school' : row.branches.join(', ')
    }}</template>
    <template #cell-invited="{ row }">{{ row.invited ?? '—' }}</template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="statusLabel(row.status)" :tone="accountTone(row.status)"
    /></template>
  </DataTable>
</template>
