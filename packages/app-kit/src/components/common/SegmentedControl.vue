<script setup lang="ts" generic="T extends string">
import { cn } from '@edutrack/ui/lib/utils';

defineProps<{ options: { value: T; label: string }[]; label: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="flex gap-1">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :class="
        cn(
          'h-7 rounded-sm border px-2.5 text-xs whitespace-nowrap transition-colors',
          model === option.value
            ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
            : 'bg-card hover:bg-muted',
        )
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
