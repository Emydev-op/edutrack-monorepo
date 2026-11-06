<script setup lang="ts">
import emptyArt from '@edutrack/ui/assets/brand/empty-state.svg';

withDefaults(defineProps<{ title: string; description?: string; illustrated?: boolean }>(), {
  illustrated: false,
});
</script>

<template>
  <div
    class="flex flex-col gap-1.5 rounded-lg border border-dashed border-[#E0D9CE] bg-surface-warm px-6 py-9"
    :class="illustrated ? 'items-center text-center' : 'items-start'"
  >
    <img v-if="illustrated" :src="emptyArt" alt="" class="mb-2 h-28" />
    <h2 class="text-base font-semibold">{{ title }}</h2>
    <span v-if="description" class="text-[13px] text-muted-foreground">{{ description }}</span>
    <div v-if="$slots.default" class="mt-1.5"><slot /></div>
  </div>
</template>
