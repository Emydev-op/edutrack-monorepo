<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, ref } from 'vue';

import { useGrowthQuery } from '@/api/services/dashboard';
import ColumnChart from '@edutrack/app-kit/components/common/ColumnChart.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import type { GrowthRange } from '@/types';

const range = ref<GrowthRange>('6m');
const { data: growth, isPending } = useGrowthQuery(range);
const bars = computed(() =>
  (growth.value?.months ?? []).map((m) => ({ label: m.month, value: m.onboarded })),
);
</script>

<template>
  <section
    class="grid gap-5 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
  >
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col">
          <h2 class="text-[15px] font-semibold">School growth</h2>
          <p class="text-xs text-muted-foreground">
            Schools onboarded per month · most join before September resumption
          </p>
        </div>
        <SegmentedControl
          v-model="range"
          :options="[
            { value: '6m', label: '6 months' },
            { value: '12m', label: '12 months' },
          ]"
          label="Growth range"
        />
      </div>
      <Skeleton v-if="isPending" class="h-[140px]" />
      <ColumnChart
        v-else
        :bars="bars"
        :height="110"
        color="#E8CFC3"
        label="Schools onboarded per month"
      />
    </div>
    <div class="self-start overflow-hidden rounded-md border border-divider">
      <div
        class="grid grid-cols-[60px_repeat(4,1fr)] gap-2 bg-muted px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
      >
        <span>Month</span><span class="text-right">Onboarded</span
        ><span class="text-right">Active</span><span class="text-right">Suspended</span
        ><span class="text-right">Expired</span>
      </div>
      <div
        v-for="m in growth?.months"
        :key="m.month"
        class="grid grid-cols-[60px_repeat(4,1fr)] gap-2 border-t border-divider px-2.5 py-1.25 text-xs tabular-nums"
      >
        <span>{{ m.month }}</span
        ><span class="text-right">{{ m.onboarded }}</span
        ><span class="text-right">{{ m.active }}</span
        ><span class="text-right">{{ m.suspended }}</span
        ><span class="text-right">{{ m.expired }}</span>
      </div>
    </div>
  </section>
</template>
