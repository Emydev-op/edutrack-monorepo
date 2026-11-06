<script setup lang="ts">
import { computed } from 'vue';

/** Simple vertical bars with the value above and the label below each bar. */
const props = withDefaults(
  defineProps<{
    /** `color` overrides the chart colour for one bar, e.g. a week still in progress. */
    bars: { label: string; value: number; display?: string; color?: string }[];
    height?: number;
    color?: string;
    label: string;
  }>(),
  { height: 110, color: 'var(--primary)' },
);
const max = computed(() => Math.max(1, ...props.bars.map((b) => b.value)));
</script>

<template>
  <div
    role="img"
    :aria-label="label"
    class="flex items-end gap-2"
    :style="{ height: `${height + 30}px` }"
  >
    <div
      v-for="bar in bars"
      :key="bar.label"
      class="flex h-full flex-1 flex-col items-center justify-end gap-1"
    >
      <span class="text-[11px] tabular-nums">{{ bar.display ?? bar.value }}</span>
      <div
        class="w-full max-w-10 rounded-t-[2px]"
        :style="{
          height: `${Math.max(4, Math.round((bar.value / max) * height))}px`,
          background: bar.color ?? color,
        }"
      />
      <span class="text-[10px] whitespace-nowrap text-faint">{{ bar.label }}</span>
    </div>
  </div>
</template>
