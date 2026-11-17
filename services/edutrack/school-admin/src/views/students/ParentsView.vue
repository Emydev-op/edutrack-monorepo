<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { EyeIcon, MailIcon, MailXIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useInviteGuardianMutation,
  useInviteGuardiansMutation,
  useWithdrawGuardianInviteMutation,
} from '@/api/services/portal-accounts';
import { useGuardiansQuery, useMergeGuardiansMutation } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import type { GuardianDuplicate, GuardianRow } from '@/types';

import AddGuardianDrawer from './AddGuardianDrawer.vue';
import InviteGuardiansDrawer from './InviteGuardiansDrawer.vue';
import { tone } from './student-tones';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const merge = useMergeGuardiansMutation();
const inviteOne = useInviteGuardianMutation();
const inviteMany = useInviteGuardiansMutation();
const withdraw = useWithdrawGuardianInviteMutation();
const invitingAll = ref(false);

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));
const { data, isPending } = useGuardiansQuery(() => ({
  search: debounced.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));

const rows = computed(() => data.value?.data ?? []);
const selection = useSelection(rows, (g) => g.id);

async function sendInvite(g: GuardianRow) {
  try {
    const result = await inviteOne.mutateAsync(g.id);
    toast.success(messageOf(result, `Invitation sent to ${g.name}.`));
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t send the invitation. Try again.'));
  }
}

function withdrawInvite(g: GuardianRow) {
  void confirm({
    title: `Withdraw ${g.name}’s invitation?`,
    details: [['What happens', 'The link stops working. You can invite them again later.']],
    confirmLabel: 'Withdraw invitation',
    tone: 'destructive',
    action: async () => {
      const result = await withdraw.mutateAsync(g.id);
      toast.success(messageOf(result, 'Invitation withdrawn.'));
    },
  });
}

async function inviteSelected() {
  try {
    const result = await inviteMany.mutateAsync({
      ids: selection.selectedRows().map((g) => g.id),
    });
    const skipped = result.skipped.length
      ? `Not invited: ${result.skipped.map((s) => `${s.name} (${s.reason.replace(/\.$/, '')})`).join(', ')}.`
      : undefined;
    if (result.invited)
      toast.success(
        messageOf(result, `${result.invited} invitation${result.invited === 1 ? '' : 's'} sent.`),
        { description: skipped },
      );
    else toast.error('Nobody to invite.', { description: skipped });
    selection.clear();
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t send the invitations. Try again.'));
  }
}

const actions = (g: GuardianRow): RowAction[] => [
  {
    label: 'View guardian',
    icon: EyeIcon,
    to: { name: routesPath.students.parent.name, params: { id: g.id } },
  },
  ...(g.portal === 'Active'
    ? []
    : [
        {
          label: g.portal === 'Invited' ? 'Resend invitation' : 'Invite to parent portal',
          icon: MailIcon,
          onSelect: () => void sendInvite(g),
        },
      ]),
  ...(g.portal === 'Invited'
    ? [{ label: 'Withdraw invitation', icon: MailXIcon, onSelect: () => withdrawInvite(g) }]
    : []),
];

/* Opened from a student with no guardian: start the add form with that child. */
const adding = ref(!!route.query.add);
const addFor = computed(() => (route.query.add as string | undefined) ?? undefined);
watch(adding, (open) => !open && route.query.add && router.replace({ query: {} }));

function mergePair(d: GuardianDuplicate) {
  void confirm({
    title: 'Merge 2 guardian records?',
    details: [
      ['Keep', d.keepLabel],
      ['Merge in', d.mergeLabel],
      ['Children', d.children],
      ['Reversible', 'No. The merge is logged in the audit trail.'],
    ],
    confirmLabel: 'Merge records',
    action: async () => {
      await merge.mutateAsync({ keepId: d.keepId, mergeId: d.mergeId });
      toast.success('Guardians merged. Children and payment history are on one record now.');
    },
  });
}

const columns: Column[] = [
  { key: 'name', label: 'Guardian', width: 'minmax(190px,1.4fr)' },
  { key: 'children', label: 'Children', width: 'minmax(200px,1.6fr)' },
  { key: 'relationship', label: 'Relationship', width: '120px' },
  { key: 'paysFees', label: 'Pays fees', width: '90px' },
  { key: 'portal', label: 'Portal', width: '120px' },
  { key: 'balance', label: 'Balance', align: 'right', width: '110px' },
];
</script>

<template>
  <PageHeader
    title="Parents / Guardians"
    :description="
      data
        ? `${data.meta.total} guardians · ${data.studentsWithoutGuardian} student${data.studentsWithoutGuardian === 1 ? '' : 's'} without a guardian`
        : undefined
    "
  >
    <template #actions>
      <Button variant="outline" @click="invitingAll = true">Invite guardians</Button>
      <Button @click="adding = true">Add guardian</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-for="d in data?.duplicates ?? []"
    :key="d.mergeId"
    tone="warning"
    title="Possible duplicate guardians"
    :description="`${d.reason} Merging keeps all children and payment history.`"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="mergePair(d)">Review and merge</Button></template
    >
  </InlineNotice>
  <InlineNotice
    v-if="data?.studentsWithoutGuardian"
    tone="info"
    :title="`${data.studentsWithoutGuardian} student${data.studentsWithoutGuardian === 1 ? ' has' : 's have'} no guardian`"
    description="Fee reminders and results can’t reach anyone until a guardian is linked."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.students.list.name, query: {} }"
          >Find them</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(g) => g.id"
    :row-label="(g) => g.name"
    :actions="actions"
    :selection="selection"
    :loading="isPending"
    :meta="data?.meta"
    min-width="960px"
    empty-text="No guardians match your search."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search guardians or children"
    /></template>
    <template #bulk>
      <Button
        size="sm"
        variant="outline"
        :disabled="inviteMany.isPending.value"
        @click="inviteSelected"
        >Invite to parent portal</Button
      >
    </template>
    <template #cell-name="{ row }">
      <CellLink
        :to="{ name: routesPath.students.parent.name, params: { id: row.id } }"
        :label="row.name"
      />
      <span class="text-xs text-faint">{{ row.phone }}</span>
    </template>
    <template #cell-children="{ row }">{{
      row.children
        .map((c) => `${c.name.split(' ')[0]} (${c.className || 'awaiting arm'})`)
        .join(', ')
    }}</template>
    <template #cell-paysFees="{ row }">{{ row.paysFees ? 'Yes' : 'No' }}</template>
    <template #cell-portal="{ row }"
      ><StatusBadge :label="row.portal" :tone="tone(row.portal)"
    /></template>
    <template #cell-balance="{ row }"
      ><span :class="!row.balance && 'text-faint'">{{ formatNaira(row.balance) }}</span></template
    >
  </DataTable>
  <AddGuardianDrawer v-model:open="adding" :student-id="addFor" />
  <InviteGuardiansDrawer v-model:open="invitingAll" />
</template>
