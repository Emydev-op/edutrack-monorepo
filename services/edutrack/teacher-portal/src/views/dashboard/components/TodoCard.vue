<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CircleCheckIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import type { DashboardBlock, DashboardTodo } from '@/types';

/** The to-do list: every item comes from real state and links to the record that needs work. */
defineProps<{
  block?: DashboardBlock<DashboardTodo[]>;
  /** Shown instead of the list when the selected term is read-only. */
  readOnlyNote?: string | null;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <SectionCard
    title="To do"
    :description="
      block?.ok && block.data.length
        ? `${block.data.length} thing${block.data.length === 1 ? '' : 's'} need you`
        : undefined
    "
    flush
  >
    <div v-if="!block" class="flex flex-col gap-2 p-4">
      <Skeleton v-for="i in 4" :key="i" class="h-11" />
    </div>
    <div v-else-if="!block.ok" class="p-4">
      <InlineNotice tone="error" title="Your to-do list couldn’t load" :description="block.error">
        <template #action>
          <Button variant="outline" size="sm" @click="$emit('retry')">Try again</Button>
        </template>
      </InlineNotice>
    </div>
    <p v-else-if="readOnlyNote" class="px-4 py-5 text-[13px] text-pretty text-muted-foreground">
      {{ readOnlyNote }}
    </p>
    <ul v-else-if="block.data.length" aria-label="To do">
      <li
        v-for="t in block.data"
        :key="t.id"
        :data-kind="t.kind"
        class="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-divider px-4 py-3 first:border-t-0 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-2.5"
      >
        <StatusBadge :label="t.badge.label" :tone="t.badge.tone" class="max-sm:hidden" />
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[13px] font-medium text-pretty">{{ t.title }}</span>
          <span class="text-xs text-pretty break-words text-faint">{{ t.detail }}</span>
        </span>
        <RouterLink
          :to="t.to"
          class="flex h-8 items-center rounded-md border px-3 text-[13px] font-medium whitespace-nowrap text-primary hover:bg-brand-tint"
          >{{ t.action }}</RouterLink
        >
      </li>
    </ul>
    <div v-else class="flex items-center gap-2.5 px-4 py-5 text-[13px] text-muted-foreground">
      <CircleCheckIcon class="size-4 shrink-0 text-success-strong" aria-hidden="true" />
      You’re all caught up. New work shows here as it comes in.
    </div>
  </SectionCard>
</template>
