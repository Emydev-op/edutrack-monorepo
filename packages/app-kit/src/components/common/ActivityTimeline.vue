<script setup lang="ts">
import { TONE_CLASSES } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { RouterLink } from 'vue-router';

import type { TimelineEntry } from '@edutrack/app-kit/types';

withDefaults(defineProps<{ items: TimelineEntry[]; title?: string; emptyText?: string }>(), {
  title: 'Activity',
  emptyText: 'Nothing has happened here yet.',
});

const dot = (tone?: TimelineEntry['tone']) => (tone ? TONE_CLASSES[tone].dot : 'bg-[#D9D2C7]');
</script>

<template>
  <section class="flex flex-col gap-3.5 rounded-lg border bg-card px-4.5 py-4">
    <h2 class="text-[15px] font-semibold">{{ title }}</h2>
    <p v-if="!items.length" class="text-[13px] text-muted-foreground">{{ emptyText }}</p>
    <ol class="flex flex-col gap-3.5">
      <li v-for="item in items" :key="item.id">
        <component
          :is="item.to ? RouterLink : 'div'"
          :to="item.to"
          :class="
            cn(
              'grid grid-cols-[12px_1fr_auto] gap-3 text-[13px]',
              item.to && 'rounded-sm hover:bg-surface-warm',
            )
          "
        >
          <span :class="cn('mt-1.5 size-2 rounded-full', dot(item.tone))" />
          <span class="flex flex-col">
            <span>{{ item.title }}</span>
            <span v-if="item.detail" class="text-xs text-faint">{{ item.detail }}</span>
          </span>
          <span class="text-xs whitespace-nowrap text-faint">{{ item.when }}</span>
        </component>
      </li>
    </ol>
  </section>
</template>
