<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { routesPath } from '@/router/routes-path';
import type { ClassDetail } from '@/types';

const props = defineProps<{ detail: ClassDetail }>();
const search = ref('');
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.detail.students.filter(
    (s) => !q || `${s.name} ${s.admissionNo} ${s.guardian}`.toLowerCase().includes(q),
  );
});
const others = computed(() => props.detail.arm.students - props.detail.students.length);
const columns: Column[] = [
  { key: 'name', label: 'Student', width: 'minmax(180px,1.5fr)' },
  { key: 'gender', label: 'Gender', width: '90px' },
  { key: 'guardian', label: 'Guardian', width: 'minmax(160px,1.3fr)' },
  { key: 'balance', label: 'Fees', align: 'right', width: '130px' },
];
</script>

<template>
  <EmptyState
    v-if="!detail.students.length"
    :title="`No students in ${detail.arm.name} yet`"
    :description="
      others > 0
        ? `${others} students are counted in this arm but have no record on Edutrack yet.`
        : 'Place admitted students in this arm from Enrollment.'
    "
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.enrollment.name }"
        >Go to Enrollment</RouterLink
      ></Button
    >
  </EmptyState>
  <DataTable
    v-else
    :title="`${detail.students.length} students`"
    :description="others > 0 ? `${others} more counted without a record on Edutrack` : undefined"
    :columns="columns"
    :rows="rows"
    :row-key="(s) => s.id"
    empty-text="No students match your search."
  >
    <template #search><SearchInput v-model="search" placeholder="Search students" /></template>
    <template #cell-name="{ row }">
      <CellLink
        :to="{ name: routesPath.students.detail.name, params: { id: row.id } }"
        :label="row.name"
        :detail="row.admissionNo"
      />
    </template>
    <template #cell-guardian="{ row }">
      <span :class="!row.guardian && 'text-error-strong'">{{
        row.guardian || 'No guardian linked'
      }}</span>
    </template>
    <template #cell-balance="{ row }">
      <span :class="row.balance ? 'text-error-strong' : 'text-success-strong'">{{
        row.balance ? formatNaira(row.balance) : 'Paid'
      }}</span>
    </template>
  </DataTable>
</template>
