<script setup lang="ts">
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';

import { routesPath } from '@/router/routes-path';
import type { BranchDetail } from '@/types';

defineProps<{ branch: BranchDetail }>();
</script>

<template>
  <KeyValueCard
    v-if="branch.finance"
    title="First Term 2026/2027"
    class="max-w-xl"
    :rows="[
      { label: 'Billed', value: branch.finance.billed },
      { label: 'Collected', value: branch.finance.collected },
      { label: 'Outstanding', value: branch.finance.outstanding, emphasis: 'error' },
      { label: 'Expenses', value: branch.finance.expenses },
    ]"
  >
    <template #action>
      <RouterLink
        :to="{ name: routesPath.finance.overview.name }"
        class="text-[13px] font-medium text-primary hover:underline"
        >Finance overview</RouterLink
      >
    </template>
  </KeyValueCard>
  <EmptyState
    v-else
    title="No financial activity yet"
    description="Fees appear once students at this branch are invoiced."
  />
</template>
