<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ClassDetail } from '@/types';

defineProps<{ detail: ClassDetail }>();
const context = useContextStore();
const columns: Column[] = [
  { key: 'subject', label: 'Subject', width: 'minmax(190px,1.5fr)' },
  { key: 'teacher', label: 'Teacher', width: 'minmax(160px,1.3fr)' },
  { key: 'average', label: 'Average', align: 'right', width: '100px' },
  { key: 'status', label: 'Status', width: '140px' },
];
</script>

<template>
  <DataTable
    :title="`${context.current.term} results by subject`"
    description="Open a subject to review its score sheet."
    :columns="columns"
    :rows="detail.results"
    :row-key="(r) => r.code"
    empty-text="This class has no subjects yet."
  >
    <template #cell-subject="{ row }">
      <CellLink
        :to="{
          name: routesPath.academics.resultSheet.name,
          params: { armId: detail.arm.id, subject: row.code },
        }"
        :label="row.subject"
        :detail="row.code"
      />
    </template>
    <template #cell-teacher="{ row }">
      <span :class="!row.teacher && 'text-error-strong'">{{ row.teacher ?? 'Unassigned' }}</span>
    </template>
    <template #cell-average="{ row }">{{
      row.average === null ? '—' : `${row.average}%`
    }}</template>
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
</template>
