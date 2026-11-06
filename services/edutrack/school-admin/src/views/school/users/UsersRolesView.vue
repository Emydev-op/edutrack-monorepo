<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';

import { useUsersQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';

import InviteUserDrawer from './InviteUserDrawer.vue';

const route = useRoute();
const { data: users } = useUsersQuery();
const inviting = ref(false);

const { school: s } = routesPath;
const tabs = computed(() =>
  (
    [
      ['Staff users', s.users.name],
      ['Roles', s.roles.name],
      ['Permissions', s.permissions.name],
      ['Invitations', s.invitations.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name },
    active: route.name === name,
    count:
      name === s.invitations.name
        ? users.value?.filter((u) => u.status === 'Invited').length || undefined
        : undefined,
  })),
);

const summary = computed(() => {
  const list = (users.value ?? []).filter((u) => u.status !== 'Revoked');
  return `${list.filter((u) => u.status === 'Active').length} active staff users · ${list.filter((u) => u.status === 'Invited').length} invited · parent and student accounts are managed from their records`;
});
</script>

<template>
  <PageHeader title="Users & Roles" :description="users ? summary : undefined">
    <template #actions>
      <Button v-if="route.name === s.roles.name" as-child
        ><RouterLink :to="{ name: s.roleNew.name }">Create role</RouterLink></Button
      >
      <Button v-else @click="inviting = true">Invite user</Button>
    </template>
  </PageHeader>
  <TabNav :tabs="tabs" label="Users and roles" />
  <RouterView />
  <InviteUserDrawer v-model:open="inviting" />
</template>
