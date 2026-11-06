<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useGuardiansQuery, useMergeGuardiansMutation } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import type { GuardianDuplicate } from '@/types';

import AddGuardianDrawer from './AddGuardianDrawer.vue';
import { tone } from './student-tones';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const merge = useMergeGuardiansMutation();

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
    <template #actions><Button @click="adding = true">Add guardian</Button></template>
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
    :rows="data?.data ?? []"
    :row-key="(g) => g.id"
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
</template>
