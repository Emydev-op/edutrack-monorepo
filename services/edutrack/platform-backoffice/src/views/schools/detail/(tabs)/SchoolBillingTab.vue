<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import { useSchoolBillingQuery } from '@/api/services/schools';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const { data: invoices, isPending } = useSchoolBillingQuery(() => props.school.id);

const columns: Column[] = [
  { key: 'id', label: 'Invoice' },
  { key: 'period', label: 'Period' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'status', label: 'Status', width: '120px' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="invoices ?? []"
    :row-key="(i) => i.id"
    :loading="isPending"
    min-width="560px"
    empty-text="No platform invoices yet."
  >
    <template #cell-id="{ row }"
      ><span class="font-medium">{{ row.id }}</span></template
    >
    <template #cell-status="{ row }"><StatusBadge :label="row.status" /></template>
  </DataTable>
</template>
