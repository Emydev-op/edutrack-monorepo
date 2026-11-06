<script setup lang="ts">
import ColumnChart from '@edutrack/app-kit/components/common/ColumnChart.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import type { SupportSummary } from '@/types';

defineProps<{ summary: SupportSummary }>();
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-3">
    <section class="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5">
      <h2 class="text-sm font-semibold">Issue volume · last 5 weeks</h2>
      <ColumnChart :bars="summary.weeklyVolume" :height="80" label="Support issues per week" />
    </section>
    <section class="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3.5">
      <h2 class="text-sm font-semibold">By category</h2>
      <MeterRow
        v-for="c in summary.byCategory"
        :key="c.label"
        :label="c.label"
        :percent="c.percent * 3"
        :value="`${c.percent}%`"
        color="var(--highlight)"
        label-width="90px"
        class="text-xs"
      />
    </section>
    <section class="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
      <h2 class="text-sm font-semibold">Most issues · 30 days</h2>
      <div v-for="s in summary.topSchools" :key="s.label" class="flex justify-between text-[13px]">
        <span>{{ s.label }}</span
        ><span class="font-semibold">{{ s.value }}</span>
      </div>
    </section>
  </div>
</template>
