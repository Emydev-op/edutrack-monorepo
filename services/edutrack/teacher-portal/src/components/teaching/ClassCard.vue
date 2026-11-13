<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import { routesPath } from '@/router/routes-path';
import type { TeachingClass } from '@/types';

import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';

import { campusClasses } from './campus';

/** One teaching assignment (class arm × subject) as a card that opens the class page. */
defineProps<{ item: TeachingClass; showCampus?: boolean }>();
</script>

<template>
  <RouterLink
    :to="{
      name: routesPath.teaching.class.name,
      params: { armId: item.armId, subject: item.subject },
    }"
    class="group flex min-w-0 flex-col gap-3 rounded-lg border bg-card px-4.5 py-4 hover:border-[#D9D5CD] hover:bg-surface-warm"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[15px] font-semibold text-foreground">{{ item.armName }}</span>
        <span class="truncate text-[13px] text-muted-foreground">{{ item.subjectName }}</span>
      </div>
      <ChevronRightIcon
        class="mt-0.5 size-4 shrink-0 text-faint group-hover:text-foreground"
        aria-hidden="true"
      />
    </div>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-if="showCampus"
        :class="
          cn(
            'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
            campusClasses(item.branchId).surface,
            campusClasses(item.branchId).text,
          )
        "
        >{{ item.branchName }}</span
      >
      <StatusBadge
        :label="item.role"
        :tone="item.role === 'Part-time' ? 'warning' : 'neutral'"
        :dot="false"
      />
      <StatusBadge v-if="item.isClassTeacher" label="Class teacher" tone="success" :dot="false" />
    </div>
    <dl
      class="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-t border-divider pt-3 text-[13px]"
    >
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Students</dt>
        <dd class="font-semibold text-foreground tabular-nums">{{ item.students }}</dd>
      </div>
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Periods / week</dt>
        <dd class="font-semibold text-foreground tabular-nums">{{ item.periodsPerWeek }}</dd>
      </div>
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Room</dt>
        <dd class="truncate text-foreground" :title="item.rooms.join(', ')">
          {{ item.rooms.join(', ') }}
        </dd>
      </div>
    </dl>
    <div
      v-if="item.sheet"
      class="flex items-center justify-between gap-2 border-t border-divider pt-3 text-[13px]"
    >
      <span class="text-xs text-faint">Result sheet</span>
      <SheetStatusBadge :status="item.sheet.status" :with-hod="item.sheet.withHod" />
    </div>
  </RouterLink>
</template>
