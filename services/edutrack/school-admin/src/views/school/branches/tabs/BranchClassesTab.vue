<script setup lang="ts">
import { RouterLink } from 'vue-router';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';

import { routesPath } from '@/router/routes-path';
import type { BranchDetail } from '@/types';

defineProps<{ branch: BranchDetail }>();

const columns: Column[] = [
  { key: 'section', label: 'Section' },
  { key: 'level', label: 'Class level' },
  { key: 'arms', label: 'Arms' },
  { key: 'students', label: 'Students', align: 'right', width: '100px' },
];
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="branch.classes"
    :row-key="(c) => c.level"
    :empty-text="`No classes at ${branch.name} yet. Create classes for it in Academics.`"
  >
    <template #cell-level="{ row }">
      <RouterLink
        :to="{ name: routesPath.academics.classes.name }"
        class="font-medium text-primary hover:underline"
        >{{ row.level }}</RouterLink
      >
    </template>
  </DataTable>
</template>
