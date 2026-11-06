<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { EyeIcon, MailIcon, PencilIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';

import {
  useInviteStaffMutation,
  useStaffFormOptionsQuery,
  useStaffListQuery,
} from '@/api/services/staff';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import type { StaffAccount, StaffListRow, StaffQuery } from '@/types';
import { accountTone } from '@/views/school/users/user-tones';

type GroupFilter = NonNullable<StaffQuery['group']>;

const route = useRoute();
const invite = useInviteStaffMutation();
const { data: options } = useStaffFormOptionsQuery();

const group = useRouteQuery<GroupFilter>('group', 'All');
const branch = useRouteQuery<string>('branch', '');
const account = useRouteQuery<string>('access', '');
const status = useRouteQuery<string>('status', 'Active');
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const debounced = refDebounced(search, 300);

const { data, isPending } = useStaffListQuery(() => ({
  group: group.value,
  branch: branch.value || undefined,
  account: (account.value || undefined) as StaffAccount | undefined,
  status: status.value === 'All' ? undefined : (status.value as 'Active' | 'Deactivated'),
  search: debounced.value || undefined,
}));
const rows = computed(() => data.value?.rows ?? []);
const selection = useSelection(rows, (s) => s.id);
watch([group, branch, account, status, debounced], () => selection.clear());

const multiBranch = computed(() => (options.value?.branches.length ?? 0) > 1);
const filtered = computed(
  () =>
    group.value !== 'All' ||
    !!branch.value ||
    !!account.value ||
    status.value !== 'Active' ||
    !!debounced.value,
);
const isNewSchool = computed(() => !!data.value && data.value.total <= 1 && !filtered.value);

/** Links keep `?from=setup` so the Setup Center step can bring the admin back. */
const fromSetup = computed(() => (route.query.from === 'setup' ? { from: 'setup' } : {}));
const addTo = computed(() => ({ name: routesPath.staff.new.name, query: fromSetup.value }));
const importTo = computed(() => ({ name: routesPath.staff.import.name, query: fromSetup.value }));

const groupOptions = computed(() => {
  const c = data.value?.counts;
  const n = (k: keyof NonNullable<typeof c>) => (c ? ` ${c[k]}` : '');
  return [
    { value: 'All' as GroupFilter, label: `All staff${n('All')}` },
    { value: 'Teaching' as GroupFilter, label: `Teachers${n('Teaching')}` },
    { value: 'Administrative' as GroupFilter, label: `Administrative${n('Administrative')}` },
    { value: 'Finance' as GroupFilter, label: `Finance${n('Finance')}` },
    { value: 'Operations' as GroupFilter, label: `Operations${n('Operations')}` },
    { value: 'No access' as GroupFilter, label: `No portal access${n('No access')}` },
  ];
});

const staffLink = (s: StaffListRow) => ({
  name: routesPath.staff.detail.name,
  params: { id: s.id },
});

async function sendInvites(ids: string[]) {
  try {
    const { invited, skipped } = await invite.mutateAsync(ids);
    if (invited)
      toast.success(`${invited} invitation${invited === 1 ? '' : 's'} sent.`, {
        description: skipped.length
          ? `Not invited: ${skipped.join(', ')}. They have no email, already have access, or need a role chosen from their profile.`
          : undefined,
      });
    else
      toast.error('Nobody to invite.', {
        description: skipped.length
          ? `${skipped.join(', ')}: add an email or choose a role from their profile, or they already have access.`
          : undefined,
      });
    selection.clear();
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t send the invitations. Try again.'));
  }
}

const actions = (s: StaffListRow): RowAction[] => [
  { label: 'View profile', icon: EyeIcon, to: staffLink(s) },
  ...(s.status === 'Active'
    ? [
        {
          label: 'Edit',
          icon: PencilIcon,
          to: { name: routesPath.staff.edit.name, params: { id: s.id } },
        },
      ]
    : []),
  ...(s.status === 'Active' && !s.isYou && ['No account', 'Invited'].includes(s.account)
    ? [
        {
          label: s.account === 'Invited' ? 'Resend invitation' : 'Invite to Edutrack',
          icon: MailIcon,
          onSelect: () => void sendInvites([s.id]),
        },
      ]
    : []),
];

const loadTone = (s: StaffListRow) => {
  const l = s.load!;
  if (!l.subjects && !s.classTeacherOf.length) return 'text-warning-strong';
  if (l.periods > l.max) return 'text-error-strong';
  if (l.periods >= l.max - 2) return 'text-warning-strong';
  return 'text-body';
};

const columns = computed<Column[]>(() => [
  { key: 'name', label: 'Staff', width: 'minmax(200px,1.5fr)' },
  { key: 'position', label: 'Position', width: 'minmax(170px,1.4fr)' },
  { key: 'department', label: 'Department', width: 'minmax(120px,1fr)' },
  ...(multiBranch.value ? [{ key: 'branch', label: 'Branch', width: 'minmax(130px,1fr)' }] : []),
  { key: 'employment', label: 'Employment', width: '110px' },
  { key: 'load', label: 'Teaching load', width: 'minmax(130px,1fr)' },
  { key: 'account', label: 'System access', width: '130px' },
  { key: 'status', label: 'Status', width: '120px' },
]);

const setupDetails = computed<[string, string][]>(() =>
  data.value
    ? [
        ['Staff', String(data.value.total)],
        ['Teachers', String(data.value.counts.Teaching)],
        ['System accounts', `${data.value.withAccounts} · ${data.value.pendingInvites} pending`],
      ]
    : [],
);
</script>

<template>
  <PageHeader
    title="Staff Directory"
    :description="
      data
        ? `${data.total} staff across all branches · ${data.withAccounts} with system accounts`
        : 'Everyone who works at the school.'
    "
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="importTo">Import staff</RouterLink></Button
      >
      <Button as-child><RouterLink :to="addTo">Add staff</RouterLink></Button>
    </template>
  </PageHeader>

  <SetupStepBar
    step="staff"
    :details="setupDetails"
    :blocked="
      data && !data.counts.Teaching
        ? 'Add at least one teacher before you can finish this step and assign classes.'
        : undefined
    "
  />

  <template v-if="isNewSchool">
    <EmptyState
      illustrated
      title="Add your first staff member"
      description="Add teachers and office staff one by one, or import them from a spreadsheet. Teaching staff are assigned to classes next."
    >
      <div class="flex gap-2">
        <Button as-child variant="outline"
          ><RouterLink :to="importTo">Import from CSV</RouterLink></Button
        >
        <Button as-child><RouterLink :to="addTo">Add staff member</RouterLink></Button>
      </div>
    </EmptyState>
  </template>

  <template v-else>
    <InlineNotice
      tone="neutral"
      title="Not every staff member needs an account"
      description="Drivers, cleaners and security can be recorded for payroll and the organogram without system access. Staff who leave are deactivated, never deleted."
    />
    <InlineNotice
      v-if="data?.unassignedTeachers.length"
      tone="warning"
      :title="`${data.unassignedTeachers.length} teacher${data.unassignedTeachers.length > 1 ? 's aren’t' : ' isn’t'} assigned to any class`"
      :description="`${data.unassignedTeachers
        .slice(0, 4)
        .map((t) => t.name)
        .join(
          ', ',
        )}${data.unassignedTeachers.length > 4 ? ' and others' : ''}. They won’t see students or score sheets in the Teacher Workspace.`"
    >
      <template #action>
        <div class="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" @click="group = 'Teaching'">Show them</Button>
          <Button as-child variant="outline" size="sm"
            ><RouterLink :to="{ name: routesPath.academics.assignments.name }"
              >Teacher Assignments</RouterLink
            ></Button
          >
        </div>
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="data?.branchesWithoutTeachers.length"
      tone="warning"
      :title="`${data.branchesWithoutTeachers.join(', ')} ${data.branchesWithoutTeachers.length > 1 ? 'have' : 'has'} no teachers`"
      description="Classes there can’t be assigned until a teacher works at that branch."
    />
    <InlineNotice
      v-if="data?.pendingInvites"
      tone="info"
      :title="`${data.pendingInvites} invitation${data.pendingInvites > 1 ? 's' : ''} pending`"
      description="Staff appear as active once they accept. You can carry on in the meantime."
    />

    <SegmentedControl v-model="group" label="Staff group" :options="groupOptions" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(s) => s.id"
      :row-label="(s) => s.name"
      :actions="actions"
      :selection="selection"
      :loading="isPending"
      min-width="1080px"
      :empty-text="
        filtered
          ? 'Nobody matches. Clear the search or filters.'
          : 'No staff yet. Add them one by one or import a CSV.'
      "
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Name, staff ID, email, phone or position"
      /></template>
      <template #filters>
        <FilterMenu
          v-if="multiBranch"
          v-model="branch"
          label="Branch"
          :options="options?.branches.map((b) => b.name) ?? []"
        />
        <FilterMenu
          v-model="account"
          label="System access"
          :options="['Active', 'Invited', 'Suspended', 'No account']"
        />
        <FilterMenu
          :model-value="status === 'Active' ? '' : status"
          label="Status"
          :options="['Deactivated', 'All']"
          @update:model-value="status = $event || 'Active'"
        />
      </template>
      <template #bulk>
        <Button
          size="sm"
          variant="outline"
          :disabled="invite.isPending.value"
          @click="sendInvites(selection.selectedRows().map((s) => s.id))"
          >Invite selected</Button
        >
      </template>
      <template #cell-name="{ row }">
        <CellLink :to="staffLink(row)" :label="`${row.name}${row.isYou ? ' (you)' : ''}`" />
        <span class="text-xs text-faint">{{ row.staffNumber }}</span>
      </template>
      <template #cell-employment="{ row }">{{ row.employment }}</template>
      <template #cell-load="{ row }">
        <span v-if="!row.load" class="text-faint">—</span>
        <span v-else-if="!row.load.subjects && !row.classTeacherOf.length" :class="loadTone(row)"
          >Not assigned</span
        >
        <span v-else class="flex flex-col">
          <span :class="loadTone(row)" class="tabular-nums"
            >{{ row.load.periods }} / {{ row.load.max }} periods</span
          >
          <span class="text-xs text-faint"
            >{{ row.load.classes }} class{{ row.load.classes === 1 ? '' : 'es'
            }}{{
              row.classTeacherOf.length ? ` · class teacher ${row.classTeacherOf.join(', ')}` : ''
            }}</span
          >
        </span>
      </template>
      <template #cell-account="{ row }"
        ><StatusBadge :label="row.account" :tone="accountTone(row.account)"
      /></template>
      <template #cell-status="{ row }">
        <span class="flex flex-col gap-0.5">
          <StatusBadge
            :label="row.status"
            :tone="row.status === 'Active' ? 'success' : 'neutral'"
          />
          <span v-if="row.leftOn" class="text-xs text-faint">Left {{ row.leftOn }}</span>
        </span>
      </template>
    </DataTable>
  </template>
</template>
