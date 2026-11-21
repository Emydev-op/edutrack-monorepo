<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { ChevronRightIcon } from '@lucide/vue';
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

/** One row: a title and detail on the left, a status badge and a value on the right. */
const props = defineProps<{
  title: string;
  sub?: string | null;
  right?: string | null;
  badge?: string | null;
  tone?: StatusTone;
  to?: RouteLocationRaw;
  href?: string | null;
  muted?: boolean;
}>();
</script>

<template>
  <component
    :is="props.to ? RouterLink : props.href ? 'a' : 'div'"
    v-bind="
      props.to
        ? { to: props.to }
        : props.href
          ? { href: props.href, target: '_blank', rel: 'noopener' }
          : {}
    "
    class="flex min-h-13 items-center gap-3 px-3.5 py-2.5 text-foreground"
    :class="[(props.to || props.href) && 'hover:bg-surface-warm', muted && 'bg-surface-warm']"
  >
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="text-sm" :class="muted && 'text-muted-foreground'"
        ><slot name="title">{{ title }}</slot></span
      >
      <span v-if="sub || $slots.sub" class="text-xs text-faint"
        ><slot name="sub">{{ sub }}</slot></span
      >
    </span>
    <StatusBadge v-if="badge" :label="badge" :tone="tone" />
    <span v-if="right" class="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">{{
      right
    }}</span>
    <slot name="end" />
    <ChevronRightIcon v-if="props.to" class="size-4 shrink-0 text-faint" aria-hidden="true" />
  </component>
</template>
