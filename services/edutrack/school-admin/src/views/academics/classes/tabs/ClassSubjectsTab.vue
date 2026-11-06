<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { routesPath } from '@/router/routes-path';
import type { ClassDetail } from '@/types';

const props = defineProps<{ detail: ClassDetail }>();
const periods = computed(() => props.detail.subjects.reduce((n, s) => n + s.periods, 0));
const columns: Column[] = [
  { key: 'name', label: 'Subject', width: 'minmax(200px,1.5fr)' },
  { key: 'type', label: 'Type', width: '130px' },
  { key: 'teacher', label: 'Teacher', width: 'minmax(170px,1.3fr)' },
  { key: 'periods', label: 'Periods / wk', align: 'right', width: '110px' },
];
</script>

<template>
  <DataTable
    :title="`Subjects & teachers · ${detail.arm.name}`"
    :description="`${detail.subjects.length} subjects · ${periods} lessons a week`"
    :columns="columns"
    :rows="detail.subjects"
    :row-key="(s) => s.code"
    empty-text="This class has no subjects yet. Set them in Subjects & Curriculum."
  >
    <template #cell-name="{ row }">
      <span class="flex flex-col"
        ><span class="font-medium">{{ row.name }}</span
        ><span class="text-xs text-faint">{{ row.code }}</span></span
      >
    </template>
    <template #cell-type="{ row }">
      <StatusBadge
        :label="row.type"
        :tone="row.type === 'Compulsory' ? 'brand' : 'info'"
        :dot="false"
      />
    </template>
    <template #cell-teacher="{ row }">
      <span v-if="row.teacher">{{ row.teacher }}</span>
      <RouterLink
        v-else
        :to="{ name: routesPath.academics.assignments.name }"
        class="text-error-strong underline-offset-2 hover:underline"
        >Unassigned · assign</RouterLink
      >
    </template>
  </DataTable>
</template>
