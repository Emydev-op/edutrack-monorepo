<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { nextTick, onMounted, useTemplateRef, watch } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

export interface TabItem {
  label: string;
  to: RouteLocationRaw;
  active: boolean;
  count?: number;
}

const props = defineProps<{ tabs: TabItem[]; label: string }>();

const nav = useTemplateRef<HTMLElement>('nav');

/**
 * On narrow screens the tab bar scrolls sideways; keep the active tab in view. Only the bar
 * scrolls (not the page), so opening a tab never jumps the page vertically.
 */
async function revealActive() {
  await nextTick();
  const bar = nav.value;
  const active = bar?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
  // The bar is `relative`, so offsetLeft is measured from its start.
  const left = active.offsetLeft;
  const right = left + active.offsetWidth;
  if (left < bar.scrollLeft) bar.scrollLeft = Math.max(0, left - 16);
  else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = right - bar.clientWidth + 16;
}

onMounted(revealActive);
watch(() => props.tabs.findIndex((t) => t.active), revealActive);
</script>

<template>
  <nav
    ref="nav"
    :aria-label="label"
    class="relative flex gap-5.5 overflow-x-auto overflow-y-hidden border-b"
  >
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
