<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm, type ConfirmRequest } from '@edutrack/app-kit/composables/useConfirm';
import { initials } from '@edutrack/app-kit/lib/format';

import { useUserActionMutation, useUserQuery, type UserAction } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import EditAccessDrawer from './EditAccessDrawer.vue';
import InviteUserDrawer from './InviteUserDrawer.vue';
import { statusLabel } from './user-tones';

const route = useRoute();
const confirm = useConfirm();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data: user, isPending, isError } = useUserQuery(id);
const act = useUserActionMutation(id);
watch(user, (u) => layout.setRecordLabel(u?.name ?? null), { immediate: true });

const editing = ref(false);
const reinviting = ref(false);

const scopeText = computed(() =>
  user.value
    ? user.value.scope === 'School'
      ? 'Whole school'
      : user.value.branches.join(', ')
    : '',
);

function run(action: UserAction, request: Omit<ConfirmRequest, 'action'>, done: string) {
  void confirm({
    ...request,
    action: async ({ text }) => {
      await act.mutateAsync({ action, reason: text || undefined });
      toast.success(done);
    },
  });
}

const actions = computed(() => {
  const u = user.value;
  if (!u) return [];
  const name = u.name;
  const suspend = () =>
    run(
      'suspend',
      {
        title: `Suspend ${name}?`,
        description:
          'They’re signed out immediately and can’t sign in. Their staff record, positions and history are kept.',
        details: [['Reversible', 'Yes. Reactivate any time.']],
        input: { label: 'Reason', placeholder: 'e.g. On leave until January', required: true },
        confirmLabel: 'Suspend account',
        tone: 'destructive',
      },
      `${name} suspended.`,
    );
  const reset = () =>
    run(
      'password-reset',
      {
        title: `Send a password reset to ${name}?`,
        details: [
          ['Sent to', u.email],
          ['Link expires', 'In 30 minutes'],
        ],
        confirmLabel: 'Send reset link',
      },
      `Reset link sent to ${u.email}.`,
    );
  const resend = () =>
    run(
      'resend',
      {
        title: `Resend the invitation to ${u.email}?`,
        details: [
          ['Previous link', 'Stops working'],
          ['New link', 'Valid for 7 days'],
        ],
        confirmLabel: 'Resend invitation',
      },
      `Invitation resent to ${u.email}.`,
    );
  const revoke = () =>
    run(
      'revoke',
      {
        title: `Revoke the invitation for ${name}?`,
        details: [['Effect', 'The link stops working. No account is created.']],
        confirmLabel: 'Revoke invitation',
        tone: 'destructive',
      },
      'Invitation revoked.',
    );
  const reactivate = () =>
    run(
      'reactivate',
      {
        title: `Reactivate ${name}?`,
        details: [
          ['Access restored', u.roles.join(', ') || 'No roles'],
          ['Sign-in', 'With their existing password'],
        ],
        confirmLabel: 'Reactivate',
      },
      `${name} reactivated.`,
    );
  const deactivate = () =>
    run(
      'deactivate',
      {
        title: `Deactivate ${name}’s account?`,
        description:
          'Use this when someone leaves. The account can’t sign in again; invite them again if they return. Their name stays on past actions.',
        details: [
          ['Staff record', 'Kept · mark them as left in Staff'],
          ['Reversible', 'No'],
        ],
        acknowledgement: 'I understand this can’t be undone',
        confirmLabel: 'Deactivate account',
        tone: 'destructive',
      },
      `${name}’s account deactivated.`,
    );
  const edit = () => (editing.value = true);
  type A = { label: string; run: () => void; kind?: 'primary' | 'danger' };
  const list: Record<string, A[]> = {
    Invited: [
      { label: 'Revoke invitation', run: revoke, kind: 'danger' },
      { label: 'Edit access', run: edit },
      { label: 'Resend invitation', run: resend, kind: 'primary' },
    ],
    Active: [
      ...(u.isYou ? [] : [{ label: 'Suspend', run: suspend, kind: 'danger' as const }]),
      { label: 'Send password reset', run: reset },
      { label: 'Edit access', run: edit, kind: 'primary' },
    ],
    Suspended: [
      { label: 'Deactivate', run: deactivate, kind: 'danger' },
      { label: 'Reactivate', run: reactivate, kind: 'primary' },
    ],
  };
  return list[u.status] ?? [];
});

const account = computed(() => [
  { label: 'Email', value: user.value!.email },
  { label: 'Status', value: statusLabel(user.value!.status) },
  { label: 'Created', value: user.value!.created },
  { label: 'Last active', value: user.value!.lastActive },
  { label: 'Two-step sign-in', value: 'Coming soon' },
]);
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-72" /></template>

  <EmptyState v-else-if="isError || !user" illustrated title="This user doesn’t exist">
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.school.users.name }">All users</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="user.name"
      :initials="initials(user.name)"
      :status="statusLabel(user.status)"
      :description="`${user.email} · ${user.position}`"
      :meta="[
        { label: 'Roles', value: user.roles.join(', ') || 'None' },
        { label: 'Scope', value: scopeText },
      ]"
    >
      <template #actions>
        <Button
          v-for="a in actions"
          :key="a.label"
          :variant="a.kind === 'primary' ? 'default' : 'outline'"
          :class="a.kind === 'danger' && 'text-destructive'"
          @click="a.run()"
          >{{ a.label }}</Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="user.status === 'Invited'"
      tone="info"
      title="Invitation pending"
      :description="`Sent ${user.invited ?? 'recently'}. It expires 7 days after sending. They set a password when they accept.`"
    />
    <InlineNotice
      v-if="user.status === 'Suspended'"
      tone="warning"
      title="Account suspended"
      description="They can’t sign in. Reactivate to restore their access, or deactivate if they’ve left."
    />
    <InlineNotice
      v-if="user.status === 'Deactivated'"
      tone="neutral"
      title="Account deactivated"
      description="This account can’t be used again. Invite the person again if they return."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="reinviting = true"
          >Invite again</Button
        ></template
      >
    </InlineNotice>
    <InlineNotice
      v-if="user.isYou"
      tone="info"
      title="This is your account"
      description="You can’t suspend yourself or remove your own School Admin role."
    />

    <div class="grid items-start gap-4 md:grid-cols-2">
      <KeyValueCard title="Account" :rows="account" />
      <KeyValueCard
        title="Access"
        :rows="[
          { label: 'Roles', value: user.roles.join(', ') || 'None' },
          {
            label: 'Scope',
            value:
              user.scope === 'School' ? 'Whole school' : `Branch · ${user.branches.join(', ')}`,
          },
        ]"
      >
        <template v-if="['Active', 'Invited'].includes(user.status)" #action>
          <button
            type="button"
            class="text-[13px] font-medium text-primary hover:underline"
            @click="editing = true"
          >
            Edit access
          </button>
        </template>
      </KeyValueCard>
      <KeyValueCard
        title="What they can do"
        :rows="
          user.can.length
            ? user.can.map(([label, value]) => ({ label, value }))
            : [{ label: 'Access', value: 'No permissions · add a role' }]
        "
      />
      <KeyValueCard
        title="Staff record"
        :rows="[
          { label: 'Position', value: user.position },
          { label: 'Staff ID', value: user.staffNumber },
        ]"
      />
    </div>
    <ActivityTimeline title="Account activity" :items="user.history" />

    <EditAccessDrawer v-model:open="editing" :user="user" />
    <InviteUserDrawer
      v-model:open="reinviting"
      :preset="{ staffId: user.staffId ?? undefined, email: user.email, roles: user.roles }"
    />
  </template>
</template>
