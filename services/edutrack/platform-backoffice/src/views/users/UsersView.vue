<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import {
  BanIcon,
  EyeIcon,
  KeyRoundIcon,
  PencilIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, shallowRef, watch } from 'vue';

import { useRolesQuery, useUsersQuery } from '@/api/services/users';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { routesPath } from '@/router/routes-path';
import type { InvitationState, PlatformUser, UserQuery } from '@/types';

import EditUserDrawer from './components/EditUserDrawer.vue';
import InviteUserDrawer from './components/InviteUserDrawer.vue';
import { useUserActions } from './components/useUserActions';

const view = useRouteQuery<'all' | 'invitations'>('view', 'all');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
const role = ref('');
const status = ref('');
const created = ref('');
const lastActive = ref('');
watch([debouncedSearch, role, status, created, lastActive], () => (page.value = '1'));

const inviting = ref(false);
const { data: roles } = useRolesQuery();
const { data, isPending } = useUsersQuery(() => ({
  view: view.value,
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
  role: role.value || undefined,
  status: (status.value || undefined) as UserQuery['status'],
  created: (created.value || undefined) as UserQuery['created'],
  lastActive: (lastActive.value || undefined) as UserQuery['lastActive'],
}));
const roleNames = computed(() => (roles.value ?? []).map((r) => r.name));

// One set of account actions, pointed at whichever row the menu was opened for.
const target = shallowRef<PlatformUser>();
const userActions = useUserActions(() => target.value);
const editing = ref(false);
const withTarget = (user: PlatformUser, run: () => unknown) => () => {
  target.value = user;
  void run();
};

const tabs = computed(() => [
  { label: 'All users', to: { query: {} }, active: view.value === 'all' },
  {
    label: 'Invitations',
    to: { query: { view: 'invitations' } },
    active: view.value === 'invitations',
  },
]);

const userColumns: Column[] = [
  { key: 'name', label: 'Name', width: 'minmax(170px,1.3fr)' },
  { key: 'email', label: 'Email', width: 'minmax(180px,1.4fr)' },
  { key: 'roleName', label: 'Role' },
  { key: 'status', label: 'Status', width: '130px' },
  { key: 'lastSeen', label: 'Last login' },
  { key: 'createdAt', label: 'Created' },
];
const invitationColumns: Column[] = [
  { key: 'name', label: 'Invitee', width: 'minmax(200px,1.5fr)' },
  { key: 'roleName', label: 'Role' },
  { key: 'invitedBy', label: 'Invited by' },
  { key: 'createdAt', label: 'Sent' },
  { key: 'invitation', label: 'Invitation', width: '120px' },
];
const INVITATION_LABEL: Record<InvitationState, string> = {
  Pending: 'Pending',
  Accepted: 'Accepted',
  Expired: 'Expired',
  Resent: 'Sent',
  Revoked: 'Cancelled',
};

const { users: r } = routesPath;
function actions(user: PlatformUser): RowAction[] {
  const view = {
    label: 'View details',
    icon: EyeIcon,
    to: { name: r.detail.name, params: { id: user.id } },
  };
  if (user.status === 'Invited') {
    return [
      view,
      {
        label: 'Resend invitation',
        icon: SendIcon,
        onSelect: withTarget(user, userActions.resendInvitation),
      },
      {
        label: 'Revoke invitation',
        icon: XCircleIcon,
        destructive: true,
        onSelect: withTarget(user, userActions.revokeInvitation),
      },
    ];
  }
  if (user.status === 'Deactivated') return [view];
  return [
    view,
    { label: 'Edit', icon: PencilIcon, onSelect: withTarget(user, () => (editing.value = true)) },
    {
      label: 'Access & permissions',
      icon: KeyRoundIcon,
      to: { name: r.access.name, params: { id: user.id } },
    },
    {
      label: 'Security & sessions',
      icon: ShieldCheckIcon,
      to: { name: r.security.name, params: { id: user.id } },
    },
    user.status === 'Suspended'
      ? {
          label: 'Reactivate user',
          icon: RotateCcwIcon,
          onSelect: withTarget(user, userActions.reactivate),
        }
      : {
          label: 'Suspend user',
          icon: BanIcon,
          destructive: true,
          onSelect: withTarget(user, userActions.suspend),
        },
  ];
}
const detail = (id: string) => ({ name: r.detail.name, params: { id } });
</script>

<template>
  <PageHeader
    title="Users"
    description="People at EduTrack with access to this back office. School users are managed inside each school."
  >
    <template #actions><Button @click="inviting = true">Invite user</Button></template>
  </PageHeader>
  <TabNav :tabs="tabs" label="User views" />
  <DataTable
    :columns="view === 'all' ? userColumns : invitationColumns"
    :rows="data?.data ?? []"
    :row-key="(u) => u.id"
    :row-label="(u) => `${u.firstName} ${u.lastName}`"
    :actions="actions"
    :loading="isPending"
    :meta="data?.meta"
    :empty-text="view === 'all' ? 'No users match your filters.' : 'No invitations.'"
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search by name or email"
    /></template>
    <template v-if="view === 'all'" #filters>
      <FilterMenu v-model="role" label="Role" :options="roleNames" />
      <FilterMenu
        v-model="status"
        label="Status"
        :options="['Active', 'Invited', 'Suspended', 'Deactivated']"
      />
      <FilterMenu v-model="created" label="Created" :options="['Last 30 days', 'Last 12 months']" />
      <FilterMenu
        v-model="lastActive"
        label="Last active"
        :options="['Today', 'Last 7 days', 'Over 30 days ago']"
      />
    </template>
    <template #cell-name="{ row }">
      <CellLink
        :to="detail(row.id)"
        :label="`${row.firstName} ${row.lastName}`"
        :detail="view === 'invitations' ? row.email : undefined"
      />
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" />
      <span v-if="row.status === 'Invited' && row.invitation" class="text-xs text-faint"
        >Invitation {{ row.invitation.toLowerCase() }}</span
      >
    </template>
    <template #cell-invitation="{ row }"
      ><StatusBadge v-if="row.invitation" :label="INVITATION_LABEL[row.invitation]"
    /></template>
  </DataTable>
  <InviteUserDrawer v-model:open="inviting" />
  <EditUserDrawer v-if="target" v-model:open="editing" :user="target" />
</template>
