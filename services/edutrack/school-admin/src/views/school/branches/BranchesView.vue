<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { EyeIcon, PencilIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatCount } from '@edutrack/app-kit/lib/format';

import { useBranchesQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';
import type { Branch } from '@/types';

const router = useRouter();
const confirm = useConfirm();
const { data, isPending } = useBranchesQuery();
const search = ref('');

const branches = computed(() => data.value?.branches ?? []);
const active = computed(() => branches.value.filter((b) => b.status === 'Active').length);
const full = computed(() => !!data.value && branches.value.length >= data.value.branchLimit);
const noHead = computed(() => branches.value.filter((b) => b.status === 'Active' && !b.headId));
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return branches.value.filter(
    (b) => !q || `${b.name} ${b.code} ${b.city}`.toLowerCase().includes(q),
  );
});

const branchLink = (b: Branch) => ({ name: routesPath.school.branch.name, params: { id: b.id } });
const location = (b: Branch) => [b.street, b.city].filter(Boolean).join(', ') || 'Address missing';

function addBranch() {
  if (!full.value) return void router.push({ name: routesPath.school.branchNew.name });
  void confirm({
    title: `Your plan allows ${data.value!.branchLimit} branches`,
    description: `You’re using all ${data.value!.branchLimit}. Inactive branches still count. Upgrade your plan to add more.`,
    confirmLabel: 'View subscription',
    action: () => router.push({ name: routesPath.settings.name }),
  });
}

const actions = (b: Branch): RowAction[] => [
  { label: 'View branch', icon: EyeIcon, to: branchLink(b) },
  {
    label: 'Edit branch',
    icon: PencilIcon,
    to: { name: routesPath.school.branchEdit.name, params: { id: b.id } },
  },
];

const columns: Column[] = [
  { key: 'name', label: 'Branch', width: 'minmax(170px,1.4fr)' },
  { key: 'location', label: 'Location', width: 'minmax(200px,1.6fr)' },
  { key: 'sections', label: 'Sections', width: 'minmax(160px,1.3fr)' },
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'staff', label: 'Staff', align: 'right', width: '70px' },
  { key: 'head', label: 'Head of campus', width: 'minmax(150px,1fr)' },
  { key: 'status', label: 'Status', width: '100px' },
];
</script>

<template>
  <PageHeader
    title="Branches"
    :description="
      data
        ? `${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${active} active · ${branches.length} of ${data.branchLimit} on your ${data.planName} plan`
        : undefined
    "
  >
    <template #actions><Button @click="addBranch">Add branch</Button></template>
  </PageHeader>

  <InlineNotice
    v-if="full"
    tone="warning"
    title="Branch limit reached"
    :description="`You’re using ${data!.branchLimit} of ${data!.branchLimit} branches on the ${data!.planName} plan. Inactive branches still count.`"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.settings.name }">View subscription</RouterLink></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="noHead.length"
    tone="warning"
    :title="`${noHead.length} active branch${noHead.length > 1 ? 'es have' : ' has'} no head of campus`"
    :description="`${noHead.map((b) => b.name).join(', ')}. Branch approvals fall back to the Principal until one is assigned.`"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink
          :to="{ name: routesPath.school.branchEdit.name, params: { id: noHead[0]!.id } }"
          >Assign</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="branches.length === 1"
    tone="info"
    title="Single-campus school"
    :description="`Everything runs under ${branches[0]!.name}. Branch selectors stay hidden until you add a second branch.`"
  />

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(b) => b.id"
    :row-label="(b) => b.name"
    :actions="actions"
    :loading="isPending"
    min-width="1000px"
    empty-text="No branches match your search. Try a different name, code or town."
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search branches by name, code or town"
    /></template>
    <template #cell-name="{ row }">
      <CellLink :to="branchLink(row)" :label="row.name" />
      <span class="text-xs text-faint">{{ row.code }}</span>
    </template>
    <template #cell-location="{ row }">
      <span :class="!row.street && 'text-error-strong'">{{ location(row) }}</span>
    </template>
    <template #cell-sections="{ row }">{{ row.sections.join(', ') }}</template>
    <template #cell-students="{ row }">{{ formatCount(row.students) }}</template>
    <template #cell-head="{ row }">
      <span :class="!row.headName && 'text-error-strong'">{{
        row.headName ?? 'Not assigned'
      }}</span>
    </template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="row.status === 'Active' ? 'success' : 'neutral'"
    /></template>
  </DataTable>
</template>
