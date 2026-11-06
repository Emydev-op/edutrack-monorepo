<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { RouterLink } from 'vue-router';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import type { AttentionItem } from '@/types';

import EmptyBlock from './EmptyBlock.vue';

defineProps<{ items?: AttentionItem[] }>();
</script>

<template>
  <SectionCard title="Needs attention" flush>
    <div v-if="!items" class="flex flex-col gap-2 p-4">
      <Skeleton v-for="i in 5" :key="i" class="h-10" />
    </div>
    <ul v-else-if="items.length">
      <li
        v-for="a in items"
        :key="a.id"
        class="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-divider px-4 py-3 first:border-t-0 max-sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <StatusBadge :label="a.badge.label" :tone="a.badge.tone" class="max-sm:hidden" />
        <span class="flex min-w-0 flex-col">
          <span class="text-[13px] font-medium text-pretty">{{ a.text }}</span>
          <span class="text-xs text-faint">{{ a.area }}</span>
        </span>
        <RouterLink
          :to="a.to"
          class="flex h-8 items-center rounded-md border px-3 text-[13px] font-medium whitespace-nowrap text-primary hover:bg-brand-tint"
          >{{ a.action }}</RouterLink
        >
      </li>
    </ul>
    <EmptyBlock
      v-else
      text="Nothing needs your attention yet. Alerts appear here once classes, students and fees are set up."
    />
  </SectionCard>
</template>
