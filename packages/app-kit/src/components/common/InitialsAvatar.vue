<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';

const props = withDefaults(
  defineProps<{ initials: string; size?: 'sm' | 'md' | 'lg'; solid?: boolean }>(),
  {
    size: 'md',
  },
);

const sizes = { sm: 'size-8 text-xs', md: 'size-9 text-xs', lg: 'size-14 text-lg' };
</script>

<template>
  <span
    aria-hidden="true"
    :class="
      cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        props.solid ? 'bg-primary text-primary-foreground' : 'bg-brand-subtle text-brand-strong',
        sizes[props.size],
      )
    "
  >
    {{ initials }}
  </span>
</template>
