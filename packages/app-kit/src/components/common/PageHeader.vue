<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import InitialsAvatar from './InitialsAvatar.vue';

defineProps<{
  title: string;
  description?: string;
  status?: string;
  /** Shows an initials avatar beside the title, for people and records. */
  initials?: string;
  meta?: { label: string; value: string }[];
}>();
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex min-w-0 flex-[1_1_360px] items-center gap-3.5">
      <InitialsAvatar v-if="initials" :initials="initials" size="lg" />
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-2xl leading-tight font-semibold">{{ title }}</h1>
          <StatusBadge v-if="status" :label="status" />
        </div>
        <p v-if="description" class="text-[13px] text-muted-foreground">{{ description }}</p>
        <div v-if="meta?.length" class="mt-1 flex flex-wrap gap-1.5">
          <span
            v-for="item in meta"
            :key="item.label"
            class="rounded-sm border bg-muted px-2 py-0.5 text-xs"
          >
            <span class="text-faint">{{ item.label }}</span> {{ item.value }}
          </span>
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
