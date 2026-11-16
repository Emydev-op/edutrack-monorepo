<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CopyIcon, EyeIcon, Trash2Icon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useRolesQuery } from '@/api/services/users';
import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { routesPath } from '@/router/routes-path';
import type { Role } from '@/types';

import { useRoleActions } from '../useRoleActions';
import RoleDrawer from './RoleDrawer.vue';

const route = useRoute();
const router = useRouter();
const { data: roles, isPending } = useRolesQuery();
const { duplicate, deleteRole } = useRoleActions();
const selected = computed(() => roles.value?.find((r) => r.id === route.params.roleId));
const showRole = (roleId?: string) =>
  router.replace({ name: routesPath.settings.access.name, params: { roleId } });

const columns: Column[] = [
  { key: 'name', label: 'Role', width: 'minmax(170px,1.3fr)' },
  { key: 'description', label: 'Description', width: 'minmax(240px,2fr)' },
  { key: 'activeUsers', label: 'Users', align: 'right', width: '70px' },
  { key: 'type', label: 'Type', width: '110px' },
];
const actions = (role: Role): RowAction[] => [
  { label: 'View permissions', icon: EyeIcon, onSelect: () => showRole(role.id) },
  { label: 'Duplicate role', icon: CopyIcon, onSelect: () => duplicate(role) },
  ...(role.predefined
    ? []
    : [
        {
          label: 'Delete role',
          icon: Trash2Icon,
          destructive: true,
          onSelect: () => deleteRole(role),
        },
      ]),
];
</script>

<template>
  <DataTable
    title="Roles"
    description="Roles are configurable. Create new ones as your team grows."
    :columns="columns"
    :rows="roles ?? []"
    :row-key="(r) => r.id"
    :row-label="(r) => r.name"
    :actions="actions"
    :loading="isPending"
  >
    <template #toolbar>
      <Button as-child class="h-9"
        ><RouterLink :to="{ name: routesPath.settings.createRole.name }"
          >Create role</RouterLink
        ></Button
      >
    </template>
    <template #cell-name="{ row }">
      <button
        type="button"
        class="text-left font-medium text-primary hover:underline"
        @click="showRole(row.id)"
      >
        {{ row.name }}
      </button>
    </template>
    <template #cell-type="{ row }"
      ><StatusBadge :dot="false" :label="row.predefined ? 'Predefined' : 'Custom'"
    /></template>
  </DataTable>
  <CardGrid>
    <KeyValueCard
      title="Invitations"
      :rows="[
        { label: 'Link valid for', value: '7 days' },
        { label: 'Allowed email domains', value: 'edutrack.ng' },
        { label: 'Who can invite', value: 'Platform Administrator' },
      ]"
    />
    <KeyValueCard
      title="Sessions & passwords"
      :rows="[
        { label: 'Session timeout', value: '30 minutes idle · 12 hours maximum' },
        { label: 'Password policy', value: '8+ characters, upper and lower case, number, symbol' },
        { label: 'Password reuse', value: 'Last 5 blocked' },
      ]"
    >
      <template #action>
        <RouterLink
          :to="{ name: routesPath.settings.security.name }"
          class="text-[13px] font-medium text-primary hover:underline"
          >Security settings</RouterLink
        >
      </template>
    </KeyValueCard>
  </CardGrid>
  <RoleDrawer :role="selected" @close="showRole(undefined)" />
</template>
