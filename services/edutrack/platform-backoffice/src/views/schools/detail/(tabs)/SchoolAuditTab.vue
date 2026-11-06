<script setup lang="ts">
import { useSchoolAuditQuery } from '@/api/services/schools';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const { data: entries, isPending } = useSchoolAuditQuery(() => props.school.id);

const columns: Column[] = [
  { key: 'timestamp', label: 'When' },
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action', width: 'minmax(220px,2fr)' },
  { key: 'previousValue', label: 'Previous' },
  { key: 'newValue', label: 'New' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="entries ?? []"
    :row-key="(e) => e.id"
    :loading="isPending"
    empty-text="No audit entries for this school yet."
  >
    <template #cell-action="{ row }"
      ><span class="font-medium">{{ row.action }}</span></template
    >
  </DataTable>
</template>
