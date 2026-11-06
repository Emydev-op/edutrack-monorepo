<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { cn } from '@edutrack/ui/lib/utils';
import { statusTone, TONE_CLASSES, type StatusTone } from '@edutrack/ui/lib/status';

const props = withDefaults(
  defineProps<{
    label: string;
    /** Overrides the default tone for this label. */
    tone?: StatusTone;
    /** Status badges lead with a dot; set false for plain category tags (entity, type, role). */
    dot?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  { dot: true },
);

const tone = computed(() => TONE_CLASSES[props.tone ?? statusTone(props.label)]);
</script>

<template>
  <span
    data-slot="status-badge"
    :class="
      cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap',
        tone.surface,
        tone.text,
        props.class,
      )
    "
  >
    <span v-if="dot" aria-hidden="true" :class="cn('size-1.5 shrink-0 rounded-full', tone.dot)" />
    <slot>{{ label }}</slot>
  </span>
</template>
