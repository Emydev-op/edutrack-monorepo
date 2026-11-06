<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui';

export interface Choice {
  value: string;
  label: string;
  description?: string;
  detail?: string;
}

withDefaults(defineProps<{ choices: Choice[]; label: string; columns?: 1 | 2 | 3 }>(), {
  columns: 1,
});
const model = defineModel<string>({ required: true });
</script>

<template>
  <RadioGroupRoot
    v-model="model"
    :aria-label="label"
    :class="
      cn('grid gap-1.5', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')
    "
  >
    <RadioGroupItem
      v-for="choice in choices"
      :key="choice.value"
      :value="choice.value"
      :class="
        cn(
          'flex items-start gap-3 rounded-lg border-[1.5px] p-3 text-left transition-colors hover:border-primary',
          'data-[state=checked]:border-primary data-[state=checked]:bg-brand-tint',
        )
      "
    >
      <span
        class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#C9C3BA] bg-card in-data-[state=checked]:border-primary"
      >
        <RadioGroupIndicator class="size-2 rounded-full bg-primary" />
      </span>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[13px] font-medium">{{ choice.label }}</span>
        <span v-if="choice.description" class="text-xs text-muted-foreground">{{
          choice.description
        }}</span>
        <span v-if="choice.detail" class="text-[11px] text-faint">{{ choice.detail }}</span>
      </span>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
