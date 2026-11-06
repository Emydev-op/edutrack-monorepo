<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CopyIcon, SendIcon, UserPlusIcon } from '@lucide/vue';
import { useClipboard } from '@vueuse/core';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import {
  useResendSchoolAdminInviteMutation,
  useSchoolAdministratorsQuery,
} from '@/api/services/schools';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import type { School, SchoolAdministrator } from '@/types';

import InviteSchoolAdminDrawer from '../../components/InviteSchoolAdminDrawer.vue';

const props = defineProps<{ school: School }>();
const { data: admins, isPending } = useSchoolAdministratorsQuery(() => props.school.id);
const resend = useResendSchoolAdminInviteMutation(() => props.school.id);
const confirm = useConfirm();
const { copy } = useClipboard();
const inviting = ref(false);

const stalled = computed(() =>
  admins.value?.find((a) => a.status === 'Invited' && a.note?.startsWith('Expires')),
);

const columns: Column[] = [
  { key: 'name', label: 'Administrator', width: 'minmax(200px,1.5fr)' },
  { key: 'role', label: 'Role' },
  { key: 'scope', label: 'Scope' },
  { key: 'invitedAt', label: 'Invited' },
  { key: 'status', label: 'Status', width: '160px' },
];

function resendInvite(admin: SchoolAdministrator) {
  void confirm({
    title: `Resend the invitation to ${admin.name}?`,
    details: [
      ['Sent to', admin.email],
      ['Previous link', 'Stops working'],
      ['New link', 'Valid for 7 days'],
    ],
    confirmLabel: 'Resend invitation',
    action: async () => {
      await resend.mutateAsync(admin.id);
      toast.success(`New invitation sent to ${admin.name}.`);
    },
  });
}

async function copyEmail(admin: SchoolAdministrator) {
  await copy(admin.email);
  toast.success('Email address copied.');
}

const actions = (admin: SchoolAdministrator): RowAction[] => [
  ...(admin.status === 'Invited'
    ? [{ label: 'Resend invitation', icon: SendIcon, onSelect: () => resendInvite(admin) }]
    : []),
  { label: 'Copy email', icon: CopyIcon, onSelect: () => copyEmail(admin) },
];
</script>

<template>
  <InlineNotice
    v-if="stalled"
    tone="warning"
    title="Invitation not accepted after 13 days"
    description="Resending creates a new link and expires the old one."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="resendInvite(stalled)"
        >Resend now</Button
      ></template
    >
  </InlineNotice>
  <DataTable
    title="School administrators"
    :columns="columns"
    :rows="admins ?? []"
    :row-key="(a) => a.id"
    :row-label="(a) => a.name"
    :actions="actions"
    :loading="isPending"
  >
    <template #toolbar>
      <Button variant="outline" class="h-9" @click="inviting = true"
        ><UserPlusIcon />Invite administrator</Button
      >
    </template>
    <template #cell-name="{ row }">
      <span class="font-medium">{{ row.name }}</span>
      <span class="text-xs text-faint">{{ row.email }}</span>
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" />
      <span v-if="row.note" class="text-xs text-faint">{{ row.note }}</span>
    </template>
  </DataTable>
  <InviteSchoolAdminDrawer v-model:open="inviting" :school="school" />
</template>
