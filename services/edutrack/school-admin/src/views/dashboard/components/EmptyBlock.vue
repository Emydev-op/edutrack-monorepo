<script setup lang="ts">
import emptyState from '@edutrack/ui/assets/brand/empty-state.svg';

/** A dashboard card's "nothing here yet" state, as in the design. */
defineProps<{ text: string }>();
</script>

<template>
  <div role="status" class="flex flex-col items-center gap-2 py-3 text-center">
    <img :src="emptyState" alt="" width="120" height="105" />
    <span class="max-w-60 text-[13px] text-pretty text-muted-foreground">{{ text }}</span>
  </div>
</template>
