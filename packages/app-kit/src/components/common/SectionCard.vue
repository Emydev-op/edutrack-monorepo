<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import type { HTMLAttributes } from 'vue';

defineProps<{
  title?: string;
  description?: string;
  /** Removes inner padding, for tables and lists that run edge to edge. */
  flush?: boolean;
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <section :class="cn('rounded-lg border bg-card', !flush && 'p-4', $props.class)">
    <header
      v-if="title || $slots.actions"
      :class="
        cn(
          'flex items-start justify-between gap-3',
          flush ? 'border-b border-divider px-4 py-3.5' : 'mb-3',
        )
      "
    >
      <div class="flex min-w-0 flex-col">
        <h2 class="text-[15px] font-semibold">{{ title }}</h2>
        <p v-if="description" class="text-xs text-muted-foreground">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
