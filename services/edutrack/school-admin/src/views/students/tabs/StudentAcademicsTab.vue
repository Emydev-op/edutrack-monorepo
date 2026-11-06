<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';

import type { StudentDetail } from '@/types';

import { tone } from '../student-tones';

defineProps<{ student: StudentDetail }>();
const columns: Column[] = [
  { key: 'session', label: 'Session', width: '120px' },
  { key: 'className', label: 'Class' },
  { key: 'branch', label: 'Branch' },
  { key: 'status', label: 'Status', width: '130px' },
  { key: 'outcome', label: 'Outcome', width: 'minmax(220px,2fr)' },
];
</script>

<template>
  <DataTable
    title="Enrollment history"
    description="Each session has its own enrollment. Past records are never overwritten."
    :columns="columns"
    :rows="student.enrollments"
    :row-key="(e) => e.session"
    empty-text="No enrollments yet."
  >
    <template #cell-session="{ row }"
      ><span class="font-medium">{{ row.session }}</span></template
    >
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="tone(row.status)"
    /></template>
  </DataTable>
  <div v-if="student.results.length" class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      v-for="r in student.results"
      :key="r.session"
      :title="r.session"
      :rows="r.terms.map(([label, value]) => ({ label, value }))"
    />
  </div>
</template>
