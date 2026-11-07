<script setup lang="ts">
import { computed } from 'vue';

import { compactNaira } from '../finance-tones';

/** Paired monthly bars: money received (brick) beside money spent (light). */
const props = withDefaults(
  defineProps<{
    months: { label: string; income: number; expenditure: number }[];
    height?: number;
  }>(),
  { height: 150 },
);
const max = computed(() => Math.max(1, ...props.months.flatMap((m) => [m.income, m.expenditure])));
const h = (v: number) => `${Math.max(v ? 3 : 0, Math.round((v / max.value) * props.height))}px`;
const summary = computed(() =>
  props.months
    .map((m) => `${m.label}: in ${compactNaira(m.income)}, out ${compactNaira(m.expenditure)}`)
    .join('; '),
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      role="img"
      :aria-label="`Income and expenditure per month. ${summary}`"
      class="flex items-end gap-3 overflow-x-auto"
      :style="{ height: `${height + 44}px` }"
    >
      <div
        v-for="m in months"
        :key="m.label"
        class="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-1"
      >
        <div class="flex w-full items-end justify-center gap-1">
          <div class="flex w-1/2 max-w-9 flex-col items-center gap-1">
            <span class="text-[10px] whitespace-nowrap tabular-nums">{{
              compactNaira(m.income)
            }}</span>
            <div class="w-full rounded-t-[2px] bg-primary" :style="{ height: h(m.income) }" />
          </div>
          <div class="flex w-1/2 max-w-9 flex-col items-center gap-1">
            <span class="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">{{
              compactNaira(m.expenditure)
            }}</span>
            <div
              class="w-full rounded-t-[2px] bg-[#E8CFC3]"
              :style="{ height: h(m.expenditure) }"
            />
          </div>
        </div>
        <span class="text-[11px] text-faint">{{ m.label }}</span>
      </div>
    </div>
    <div class="flex gap-4 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5"
        ><span class="size-2.5 rounded-sm bg-primary" />Income</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="size-2.5 rounded-sm bg-[#E8CFC3]" />Expenditure</span
      >
    </div>
  </div>
</template>
