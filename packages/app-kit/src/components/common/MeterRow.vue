<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';

/** A labelled horizontal bar: "Active ▇▇▇▇▇▇ 186 schools". */
defineProps<{
  label: string;
  percent: number;
  value: string;
  color: string;
  to?: RouteLocationRaw;
  labelWidth?: string;
  /** Width of the value column (default 84px), for longer values like "82% · on track". */
  valueWidth?: string;
}>();
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="grid items-center gap-2.5 py-0.5 text-[13px]"
    :class="to && 'hover:text-primary'"
    :style="{ gridTemplateColumns: `${labelWidth ?? '110px'} 1fr ${valueWidth ?? '84px'}` }"
  >
    <span>{{ label }}</span>
    <span class="block h-2 overflow-hidden rounded-[2px] bg-muted">
      <span
        class="block h-full"
        :style="{ width: `${Math.max(3, Math.min(100, percent))}%`, background: color }"
      />
    </span>
    <span class="text-right tabular-nums">{{ value }}</span>
  </component>
</template>
