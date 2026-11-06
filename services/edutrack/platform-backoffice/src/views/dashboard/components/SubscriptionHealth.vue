<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import { useSubscriptionHealthQuery } from '@/api/services/dashboard';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import { routesPath } from '@/router/routes-path';

const { data: health, isPending } = useSubscriptionHealthQuery();
const COLOR = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  neutral: 'var(--neutral)',
};
const max = () => Math.max(1, ...(health.value ?? []).map((h) => h.schools));
</script>

<template>
  <section class="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
    <h2 class="text-[15px] font-semibold">Subscription health</h2>
    <Skeleton v-if="isPending" class="h-28" />
    <MeterRow
      v-for="item in health"
      :key="item.status"
      :label="item.label"
      :percent="(item.schools / max()) * 100"
      :value="`${item.schools} schools`"
      :color="COLOR[item.tone]"
      :to="{ name: routesPath.subscriptions.name, query: { status: item.status } }"
    />
  </section>
</template>
