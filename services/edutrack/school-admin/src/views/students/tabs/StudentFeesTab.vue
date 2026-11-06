<script setup lang="ts">
import { RouterLink } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { routesPath } from '@/router/routes-path';
import type { StudentDetail } from '@/types';

defineProps<{ student: StudentDetail }>();
</script>

<template>
  <EmptyState
    v-if="!student.invoices.length"
    title="No invoices"
    description="Nothing has been billed to this student yet, or everything is paid."
  />
  <div v-else class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      v-for="(inv, i) in student.invoices"
      :key="inv.number"
      :title="inv.period"
      :status="inv.status"
      :footer="i > 0 ? 'Old balances stay attached to the session they belong to.' : undefined"
      :rows="[
        { label: 'Invoice', value: inv.number },
        { label: 'Total', value: formatNaira(inv.total) },
        { label: 'Paid', value: formatNaira(inv.paid) },
        { label: 'Pending verification', value: inv.pending ? formatNaira(inv.pending) : '—' },
        {
          label: 'Balance',
          value: formatNaira(inv.balance),
          emphasis: inv.balance ? 'error' : 'success',
        },
      ]"
    >
      <template v-if="i === 0" #action>
        <RouterLink
          :to="{ name: routesPath.finance.invoices.name }"
          class="text-[13px] font-medium text-primary hover:underline"
          >Open invoice</RouterLink
        >
      </template>
    </KeyValueCard>
  </div>
  <ActivityTimeline
    title="Payment history"
    :items="student.payments"
    empty-text="No payments recorded yet."
  />
</template>
