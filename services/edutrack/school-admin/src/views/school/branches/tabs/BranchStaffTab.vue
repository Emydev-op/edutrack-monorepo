<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { accountTone } from '@/views/school/users/user-tones';
import type { BranchDetail } from '@/types';

defineProps<{ branch: BranchDetail }>();

const columns: Column[] = [
  { key: 'name', label: 'Staff', width: 'minmax(180px,1.4fr)' },
  { key: 'position', label: 'Position', width: 'minmax(180px,1.4fr)' },
  { key: 'scope', label: 'Branch scope' },
  { key: 'account', label: 'Account', width: '120px' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="branch.staffList"
    :row-key="(s) => s.id"
    :empty-text="`No staff are assigned to ${branch.name}. Assign staff from the Staff directory.`"
  >
    <template #cell-name="{ row }"
      ><span class="font-medium">{{ row.name }}</span></template
    >
    <template #cell-account="{ row }"
      ><StatusBadge :label="row.account" :tone="accountTone(row.account)"
    /></template>
  </DataTable>
</template>
