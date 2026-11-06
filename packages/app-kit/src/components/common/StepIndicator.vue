<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
import { cn } from '@edutrack/ui/lib/utils';

withDefaults(defineProps<{ steps: string[]; current: number; size?: 'sm' | 'md' }>(), {
  size: 'md',
});
</script>

<template>
  <ol
    :class="
      cn('flex flex-wrap items-center gap-2', size === 'sm' ? 'gap-1.5 text-xs' : 'text-[13px]')
    "
  >
    <li
      v-for="(step, i) in steps"
      :key="step"
      class="flex items-center gap-2"
      :aria-current="i === current ? 'step' : undefined"
    >
      <span
        :class="
          cn(
            'flex items-center justify-center rounded-full border',
            size === 'sm' ? 'size-5 text-[11px]' : 'size-6 text-xs',
            i < current && 'border-success bg-success text-white',
            i === current && 'border-primary bg-primary text-white',
            i > current && 'bg-card text-faint',
          )
        "
      >
        <CheckIcon v-if="i < current" class="size-3" :stroke-width="3" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span
        :class="cn(i <= current ? 'text-foreground' : 'text-faint', i === current && 'font-medium')"
        >{{ step }}</span
      >
      <span
        v-if="i < steps.length - 1"
        aria-hidden="true"
        :class="cn('h-px bg-border', size === 'sm' ? 'w-3' : 'w-4.5')"
      />
    </li>
  </ol>
</template>
