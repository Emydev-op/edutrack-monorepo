<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { useUserQuery } from '@/api/services/users';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import EditUserDrawer from '../components/EditUserDrawer.vue';
import { useUserActions, userActionsKey } from '../components/useUserActions';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: user, isPending, isError } = useUserQuery(id);
const layout = useLayoutStore();
const editing = ref(false);
watch(user, (u) => layout.setRecordLabel(u ? `${u.firstName} ${u.lastName}` : null), {
  immediate: true,
});

const actions = useUserActions(() => user.value);
provide(userActionsKey, actions);
const { users: r } = routesPath;
const tabs = computed(() =>
  [
    ['Overview', r.detail.name],
    ['Access', r.access.name],
    ['Activity', r.activity.name],
    ['Security', r.security.name],
  ].map(([label, name]) => ({
    label: label!,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);
const invited = computed(() => user.value?.status === 'Invited');
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-48" /></template>

  <EmptyState
    v-else-if="isError || !user"
    title="User not found"
    description="They may have been removed, or the link is incomplete."
    illustrated
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.list.name }">Back to users</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="`${user.firstName} ${user.lastName}`"
      :initials="`${user.firstName[0]}${user.lastName[0]}`"
      :status="user.status"
      :description="`${user.roleName} · ${user.email}`"
    >
      <template #actions>
        <template v-if="invited">
          <Button variant="destructive-outline" @click="actions.revokeInvitation()"
            >Revoke invitation</Button
          >
          <Button @click="actions.resendInvitation()">Resend invitation</Button>
        </template>
        <template v-else-if="user.status !== 'Deactivated'">
          <Button variant="outline" @click="editing = true">{{
            route.name === r.access.name ? 'Edit role' : 'Edit'
          }}</Button>
          <Button v-if="user.status === 'Suspended'" @click="actions.reactivate()"
            >Reactivate</Button
          >
          <Button v-else variant="destructive-outline" @click="actions.suspend()">Suspend</Button>
        </template>
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="User sections" />
    <InlineNotice
      v-if="invited"
      :tone="user.invitation === 'Expired' ? 'error' : 'info'"
      :title="`Invitation ${user.invitation === 'Expired' ? 'expired' : user.invitation === 'Resent' ? 'resent' : 'pending'}`"
      :description="
        user.invitation === 'Expired'
          ? 'The link expired 7 days after it was sent. Resend to generate a new one.'
          : `Waiting for ${user.firstName} to accept and create their account.`
      "
    >
      <template v-if="user.invitation !== 'Expired'" #action>
        <RouterLink
          :to="{ name: routesPath.auth.acceptInvitation.name, params: { token: user.id } }"
          class="text-[13px] font-medium whitespace-nowrap text-primary hover:underline"
        >
          Open their invitation link
        </RouterLink>
      </template>
    </InlineNotice>
    <RouterView v-slot="{ Component }"><component :is="Component" :user="user" /></RouterView>
    <EditUserDrawer v-model:open="editing" :user="user" />
  </template>
</template>
