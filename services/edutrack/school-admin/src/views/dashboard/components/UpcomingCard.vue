<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { RouterLink } from 'vue-router';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { routesPath } from '@/router/routes-path';
import type { CalendarEventType, DashboardSummary } from '@/types';

import EmptyBlock from './EmptyBlock.vue';

defineProps<{ events?: DashboardSummary['upcoming'] }>();

const TONE: Record<CalendarEventType, StatusTone> = {
  Examination: 'error',
  Results: 'brand',
  Meeting: 'info',
  PTA: 'success',
  Event: 'warning',
  Term: 'neutral',
  Break: 'neutral',
  Holiday: 'neutral',
};
</script>

<template>
  <SectionCard title="Upcoming">
    <template #actions>
      <RouterLink
        :to="{ name: routesPath.academics.calendar.name }"
        class="text-[13px] font-medium text-primary hover:underline"
        >Calendar</RouterLink
      >
    </template>
    <div v-if="!events" class="flex flex-col gap-2">
      <Skeleton v-for="i in 4" :key="i" class="h-8" />
    </div>
    <ul v-else-if="events.length" class="flex flex-col gap-2.5">
      <li
        v-for="e in events"
        :key="`${e.date}-${e.title}`"
        class="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-2.5 text-[13px]"
      >
        <span class="font-medium tabular-nums">{{ e.date }}</span>
        <span class="flex flex-col items-start gap-1">
          <StatusBadge :label="e.type" :tone="TONE[e.type]" />
          <span>{{ e.title }}</span>
        </span>
      </li>
    </ul>
    <EmptyBlock v-else text="No events yet. Add term dates in your academic session." />
  </SectionCard>
</template>
