<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from '@edutrack/ui/components/tooltip';
import { cn } from '@edutrack/ui/lib/utils';
import { InfoIcon } from '@lucide/vue';
import type { HTMLAttributes } from 'vue';

defineProps<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Hints that warn about a consequence rather than explain. */
  hintTone?: 'muted' | 'warning';
  /**
   * A fuller explanation behind an info icon beside the label (hover or keyboard focus), for
   * what the short hint can't say: what the value is used for, the format, examples.
   */
  info?: string;
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5 text-[13px] font-medium', $props.class)">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5">
        <label :for="id">{{ label }}<span v-if="required" class="text-destructive"> *</span></label>
        <Tooltip v-if="info" :delay-duration="150">
          <TooltipTrigger as-child>
            <button
              type="button"
              :aria-label="`About ${label}`"
              :aria-describedby="`${id}-info`"
              class="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-foreground focus-visible:text-foreground"
            >
              <InfoIcon class="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" class="max-w-72 text-left leading-relaxed">
            {{ info }}
          </TooltipContent>
        </Tooltip>
        <!-- Read by screen readers with the button, whether or not the tooltip is open. -->
        <span v-if="info" :id="`${id}-info`" class="sr-only">{{ info }}</span>
      </span>
      <slot name="label-aside" />
    </div>
    <slot />
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-normal text-destructive">
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="`${id}-hint`"
      :class="
        cn('text-xs font-normal', hintTone === 'warning' ? 'text-warning-strong' : 'text-faint')
      "
    >
      {{ hint }}
    </p>
  </div>
</template>
