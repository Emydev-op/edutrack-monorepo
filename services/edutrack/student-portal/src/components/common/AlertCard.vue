<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { TONE_CLASSES, type StatusTone } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

/** A coloured notice with an optional action (overdue fees, a transfer being verified…). */
const props = defineProps<{
  tone: StatusTone;
  title: string;
  text?: string | null;
  action?: { label: string; to: RouteLocationRaw } | null;
}>();
</script>

<template>
  <div
    role="status"
    :class="
      cn('flex items-center gap-2.5 rounded-lg px-3.5 py-3', TONE_CLASSES[props.tone].surface)
    "
  >
    <span class="flex min-w-0 flex-1 flex-col text-[13px]">
      <span :class="cn('font-semibold', TONE_CLASSES[props.tone].text)">{{ title }}</span>
      <span v-if="text" class="text-pretty text-body">{{ text }}</span>
      <slot />
    </span>
    <Button v-if="action" as-child size="sm" class="h-10 shrink-0">
      <RouterLink :to="action.to">{{ action.label }}</RouterLink>
    </Button>
  </div>
</template>
