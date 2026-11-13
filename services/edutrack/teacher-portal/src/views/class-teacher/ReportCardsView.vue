<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useReportCardsQuery } from '@/api/services/class-teacher';
import { percentLabel } from '@/components/class-teacher/attendance';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import type { ReportCardRow } from '@/types';

const { data, isPending, error } = useReportCardsQuery();
const filter = useRouteQuery<'all' | 'missing' | 'done'>('show', 'all');

const shown = computed(() =>
  (data.value?.students ?? []).filter((s) =>
    filter.value === 'missing' ? !s.done : filter.value === 'done' ? s.done : true,
  ),
);
const percent = computed(() =>
  data.value?.progress.total
    ? Math.round((data.value.progress.done / data.value.progress.total) * 100)
    : 0,
);
const final = (row: ReportCardRow) => row.results.filter((x) => x.total !== null).length;
const scoreOf = (row: ReportCardRow, code: string) => row.results.find((x) => x.subject === code);
</script>

<template>
  <PageHeader
    :title="data ? `Report cards · ${data.arm}` : 'Report cards'"
    :description="
      data
        ? `${data.term}. Write each student’s remark and conduct ratings; subject totals appear as sheets are approved.`
        : 'Remarks and conduct ratings for your class.'
    "
  />
  <AccessDenied v-if="isForbidden(error)" what="My class" :reason="getApiErrorMessage(error)" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Report cards couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton class="h-16 w-full" />
    <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !data.students.length"
    title="No students in your class"
    description="Students appear here once the academic office enrols them."
  />
  <template v-else-if="data">
    <InlineNotice
      v-if="data.lockReason"
      tone="neutral"
      title="Read-only"
      :description="data.lockReason"
    />
    <section class="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-[15px] font-semibold"
          >Remarks done: {{ data.progress.done }} of {{ data.progress.total }}</span
        >
        <span class="text-xs text-muted-foreground">{{
          data.progress.done === data.progress.total
            ? 'Every student is done.'
            : `${data.progress.total - data.progress.done} still need a remark or ratings.`
        }}</span>
      </div>
      <div
        class="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Remarks done"
      >
        <span class="block h-full rounded-full bg-success" :style="{ width: `${percent}%` }" />
      </div>
    </section>

    <SegmentedControl
      v-model="filter"
      label="Show"
      :options="[
        { value: 'all', label: `All · ${data.progress.total}` },
        { value: 'missing', label: `Missing remark · ${data.progress.total - data.progress.done}` },
        { value: 'done', label: `Done · ${data.progress.done}` },
      ]"
    />

    <p
      v-if="!shown.length"
      class="rounded-lg border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground"
    >
      {{
        filter === 'missing' ? 'Every student has a remark and ratings.' : 'No students here yet.'
      }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="s in shown" :key="s.studentId">
        <RouterLink
          :to="{ name: r.classTeacher.reportCard.name, params: { studentId: s.studentId } }"
          class="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 hover:border-[#D9D5CD] hover:bg-surface-warm"
        >
          <span class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex min-w-0 flex-col">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{{ s.name }}</span>
                <StatusBadge
                  :label="s.done ? 'Remark done' : 'Remark missing'"
                  :tone="s.done ? 'success' : 'warning'"
                />
              </span>
              <span class="text-xs text-muted-foreground"
                >{{ s.admissionNo }} · attendance {{ percentLabel(s.attendance.percent) }} ({{
                  s.attendance.absent
                }}
                absent) · {{ final(s) }} of {{ s.results.length }} subjects final</span
              >
            </span>
            <span class="flex items-center gap-1 text-[13px] font-medium text-primary"
              >{{ data.editable ? (s.done ? 'Edit' : 'Write remark') : 'View' }}
              <ChevronRightIcon class="size-4"
            /></span>
          </span>
          <span v-if="s.remark" class="line-clamp-1 text-xs text-faint">“{{ s.remark }}”</span>
          <span class="flex flex-wrap gap-1" aria-label="Subject totals so far">
            <span
              v-for="sub in data.subjects.filter((x) => scoreOf(s, x.code))"
              :key="sub.code"
              class="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]"
              :title="sub.name"
            >
              <span class="text-muted-foreground">{{ sub.code }}</span>
              <span v-if="scoreOf(s, sub.code)!.total !== null" class="font-semibold tabular-nums"
                >{{ scoreOf(s, sub.code)!.total }} {{ scoreOf(s, sub.code)!.grade }}</span
              >
              <span v-else class="text-faint">Pending</span>
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </template>
</template>
