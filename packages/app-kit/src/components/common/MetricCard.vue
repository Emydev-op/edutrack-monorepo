<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

defineProps<{
  label: string;
  value?: string | number;
  hint?: string;
  to?: RouteLocationRaw;
  loading?: boolean;
  /** Colours the hint: good news, something to look at, or a problem. */
  hintTone?: 'success' | 'warning' | 'error' | 'neutral';
}>();

const HINT_CLASS = {
  success: 'text-success-strong',
  warning: 'text-warning-strong',
  error: 'text-error-strong',
  neutral: 'text-muted-foreground',
};
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="flex flex-col gap-0.5 rounded-lg border bg-card px-3.5 py-3 transition-colors"
    :class="to && 'hover:border-primary'"
  >
    <span class="text-xs text-muted-foreground">{{ label }}</span>
    <Skeleton v-if="loading" class="my-1 h-6 w-16" />
    <span v-else class="text-xl font-semibold tabular-nums">{{ value }}</span>
    <span :class="['text-[11px]', hintTone ? HINT_CLASS[hintTone] : 'text-faint']">{{ hint }}</span>
  </component>
</template>
