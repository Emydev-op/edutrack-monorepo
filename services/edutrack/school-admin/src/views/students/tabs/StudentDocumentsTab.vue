<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import type { StudentDetail } from '@/types';

import { tone } from '../student-tones';

defineProps<{ student: StudentDetail }>();
const columns: Column[] = [
  { key: 'name', label: 'Document', width: 'minmax(200px,1.5fr)' },
  { key: 'required', label: 'Required' },
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'status', label: 'Status', width: '120px' },
];
</script>

<template>
  <DataTable
    title="Documents"
    :columns="columns"
    :rows="student.documents"
    :row-key="(d) => d.name"
  >
    <template #cell-name="{ row }"
      ><span class="font-medium">{{ row.name }}</span></template
    >
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="tone(row.status)"
    /></template>
  </DataTable>
</template>
