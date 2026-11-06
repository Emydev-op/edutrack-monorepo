<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

export interface TabItem {
  label: string;
  to: RouteLocationRaw;
  active: boolean;
  count?: number;
}

defineProps<{ tabs: TabItem[]; label: string }>();
</script>

<template>
  <nav :aria-label="label" class="flex gap-5.5 overflow-x-auto border-b">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.label"
      :to="tab.to"
      :aria-current="tab.active ? 'page' : undefined"
      :class="
        cn(
          '-mb-px flex items-center gap-1.5 border-b-2 py-2 text-sm whitespace-nowrap transition-colors hover:text-foreground',
          tab.active
            ? 'border-primary font-medium text-primary'
            : 'border-transparent text-muted-foreground',
        )
      "
    >
      {{ tab.label }}
      <span
        v-if="tab.count"
        class="rounded-sm bg-highlight-subtle px-1.5 text-[11px] text-warning-strong"
      >
        {{ tab.count }}
      </span>
    </RouterLink>
  </nav>
</template>
