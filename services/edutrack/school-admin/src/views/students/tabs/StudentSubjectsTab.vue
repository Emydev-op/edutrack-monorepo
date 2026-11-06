<script setup lang="ts">
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { useContextStore } from '@/stores/context';
import type { StudentDetail } from '@/types';

defineProps<{ student: StudentDetail }>();
const context = useContextStore();
const columns: Column[] = [
  { key: 'name', label: 'Subject', width: 'minmax(180px,1.4fr)' },
  { key: 'type', label: 'Type', width: 'minmax(200px,1.4fr)' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'since', label: 'Since', width: '120px' },
];
</script>

<template>
  <DataTable
    :title="`Subject enrollment · ${context.current.session}`"
    description="Compulsory subjects, one religious choice and one elective choice"
    :columns="columns"
    :rows="student.subjects"
    :row-key="(s) => s.name"
    empty-text="Subjects are added when the student is enrolled into a class arm."
  >
    <template #cell-name="{ row }"
      ><span class="font-medium">{{ row.name }}</span></template
    >
  </DataTable>
</template>
