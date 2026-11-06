<script setup lang="ts">
import type { StatusTone } from '@edutrack/ui/lib/status';
import { TONE_CLASSES } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';

const props = defineProps<{ tone: StatusTone; title: string; description?: string }>();
</script>

<template>
  <div
    role="status"
    :class="cn('flex items-center gap-3 rounded-md px-3.5 py-3', TONE_CLASSES[props.tone].surface)"
  >
    <div class="flex flex-1 flex-col gap-0.5 text-[13px]">
      <span :class="cn('font-semibold', TONE_CLASSES[props.tone].text)">{{ title }}</span>
      <span v-if="description" class="text-body">{{ description }}</span>
    </div>
    <slot name="action" />
  </div>
</template>
