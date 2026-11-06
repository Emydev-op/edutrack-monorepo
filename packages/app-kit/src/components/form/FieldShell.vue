<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import type { HTMLAttributes } from 'vue';

defineProps<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Hints that warn about a consequence rather than explain. */
  hintTone?: 'muted' | 'warning';
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5 text-[13px] font-medium', $props.class)">
    <label :for="id" class="flex items-center justify-between gap-2">
      <span>{{ label }}<span v-if="required" class="text-destructive"> *</span></span>
      <slot name="label-aside" />
    </label>
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
