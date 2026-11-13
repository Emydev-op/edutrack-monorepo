<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { RouterLink } from 'vue-router';

import { routesPath } from '@/router/routes-path';
import type { LessonStatus, TodayLesson } from '@/types';

import { campusClasses } from './campus';

/**
 * Today's lessons with Done / Now / Next / Later (computed by the API from its clock), each
 * opening the lesson page. Reusable on the dashboard with `GET /v1/teaching/timetable`'s
 * `todayLessons`.
 */
defineProps<{ lessons: TodayLesson[]; showCampus?: boolean }>();

const TONE: Record<LessonStatus, StatusTone> = {
  Done: 'neutral',
  Now: 'success',
  Next: 'info',
  Later: 'neutral',
};
</script>

<template>
  <ol class="flex flex-col divide-y divide-divider">
    <li v-for="l in lessons" :key="l.id">
      <RouterLink
        :to="{ name: routesPath.teaching.lesson.name, params: { lessonId: l.id } }"
        :class="
          cn(
            'flex items-center gap-3 px-4 py-2.5 hover:bg-muted',
            l.status === 'Done' && 'opacity-70',
            l.status === 'Now' && 'bg-success-subtle/40',
          )
        "
      >
        <span class="flex w-12 shrink-0 flex-col text-xs tabular-nums">
          <span class="font-medium text-foreground">{{ l.start }}</span>
          <span class="text-faint">{{ l.end }}</span>
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[13px] font-medium text-foreground"
            >{{ l.armName }} · {{ l.subjectName }}</span
          >
          <span class="flex min-w-0 items-start gap-1.5 text-xs text-faint">
            <span
              v-if="showCampus"
              :class="cn('mt-1 size-2 shrink-0 rounded-full', campusClasses(l.branchId).dot)"
              aria-hidden="true"
            />
            <span class="min-w-0"
              >{{ l.periodLabel }} · {{ l.room
              }}<template v-if="showCampus"> · {{ l.branchShort }}</template></span
            >
          </span>
        </span>
        <StatusBadge :label="l.status" :tone="TONE[l.status]" class="shrink-0" />
      </RouterLink>
    </li>
  </ol>
</template>
