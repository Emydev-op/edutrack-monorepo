<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    initials: string;
    size?: 'sm' | 'md' | 'lg';
    solid?: boolean;
    /** Photo to show instead of the initials; the initials come back if it fails to load. */
    src?: string | null;
  }>(),
  {
    size: 'md',
    src: null,
  },
);

const sizes = { sm: 'size-8 text-xs', md: 'size-9 text-xs', lg: 'size-14 text-lg' };

const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    :class="cn('shrink-0 rounded-full object-cover ring-1 ring-border', sizes[props.size])"
    @error="failed = true"
  />
  <span
    v-else
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
