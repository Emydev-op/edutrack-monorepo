<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

/** A titled card of rows, with an optional "All" link (the design's list sections). */
defineProps<{ title: string; link?: string; to?: RouteLocationRaw; empty?: string }>();
</script>

<template>
  <section class="flex flex-col gap-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-sm font-semibold">{{ title }}</h2>
      <RouterLink
        v-if="to && link"
        :to="to"
        class="py-2 text-[13px] font-medium text-primary hover:underline"
        >{{ link }}</RouterLink
      >
    </div>
    <div class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider">
      <slot />
      <p v-if="empty" class="px-3.5 py-3.5 text-[13px] text-muted-foreground">{{ empty }}</p>
    </div>
  </section>
</template>
