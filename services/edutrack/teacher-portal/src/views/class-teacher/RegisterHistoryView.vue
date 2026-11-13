<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { DownloadIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';

import { useRegisterHistoryQuery } from '@/api/services/class-teacher';
import { percentLabel } from '@/components/class-teacher/attendance';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';

const { data, isPending, error } = useRegisterHistoryQuery();
const tab = useRouteQuery<'days' | 'students'>('tab', 'days');
const tabs = computed(() => [
  { label: 'By day', to: { query: { tab: undefined } }, active: tab.value === 'days' },
  {
    label: 'By student',
    to: { query: { tab: 'students' } },
    active: tab.value === 'students',
  },
]);

const lowest = computed(
  () =>
    [...(data.value?.students ?? [])]
      .filter((s) => s.percent !== null)
      .sort((a, b) => a.percent! - b.percent!)[0],
);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function exportCsv() {
  const h = data.value!;
  if (tab.value === 'students')
    downloadCsv(
      `register-${slug(h.arm)}-${slug(h.term)}-students.csv`,
      [
        'Student',
        'Admission no',
        'School days',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Attendance %',
        'Note',
      ],
      h.students.map((s) => [
        s.name,
        s.admissionNo,
        s.schoolDays,
        s.present,
        s.late,
        s.absent,
        s.excused,
        s.percent ?? '',
        s.note,
      ]),
    );
  else
    downloadCsv(
      `register-${slug(h.arm)}-${slug(h.term)}-days.csv`,
      [
        'Date',
        'Taken',
        'Taken by',
        'Students',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Attendance %',
      ],
      h.days.map((d) => [
        d.date,
        d.taken ? 'Yes' : 'No',
        d.takenBy ?? '',
        d.students,
        d.present,
        d.late,
        d.absent,
        d.excused,
        d.percent ?? '',
      ]),
    );
}
</script>

<template>
  <PageHeader
    :title="data ? `Register history · ${data.arm}` : 'Register history'"
    :description="
      data ? `${data.term} · school days so far, newest first.` : 'Attendance for the term.'
    "
  />
  <AccessDenied v-if="isForbidden(error)" what="My class" :reason="getApiErrorMessage(error)" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The register history couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton class="h-20 w-full" />
    <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !data.schoolDays"
    title="No school days yet"
    description="The register history fills in from the first day of term."
  />
  <template v-else-if="data">
    <MetricGrid>
      <MetricCard
        label="Attendance this term"
        :value="percentLabel(data.percent)"
        hint="Present or late ÷ marked"
      />
      <MetricCard label="School days" :value="data.schoolDays" :hint="`${data.daysTaken} taken`" />
      <MetricCard
        label="Not taken"
        :value="data.notTaken"
        :hint="data.notTaken ? 'Days with no register' : 'Every day taken'"
        :hint-tone="data.notTaken ? 'warning' : 'success'"
      />
      <MetricCard
        v-if="lowest"
        label="Lowest attendance"
        :value="percentLabel(lowest.percent)"
        :hint="lowest.name"
      />
    </MetricGrid>

    <div class="flex flex-wrap items-end justify-between gap-2">
      <TabNav :tabs="tabs" label="History views" />
      <Button variant="outline" size="sm" @click="exportCsv"
        ><DownloadIcon class="size-4" /> Export CSV</Button
      >
    </div>

    <!-- By day -->
    <section v-if="tab === 'days'" class="rounded-lg border bg-card">
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="d in data.days" :key="d.date">
          <RouterLink
            :to="{
              name: r.classTeacher.register.name,
              query: d.date === data.today ? {} : { date: d.date },
            }"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col">
              <span class="font-medium">{{ formatWeekday(d.date, { year: false }) }}</span>
              <span v-if="d.taken" class="text-xs text-muted-foreground"
                >{{ d.present }} present · {{ d.late }} late · {{ d.absent }} absent ·
                {{ d.excused }} excused</span
              >
              <span v-else class="text-xs text-muted-foreground">{{ d.students }} students</span>
            </span>
            <span class="flex items-center gap-2">
              <span v-if="d.taken" class="font-semibold tabular-nums">{{
                percentLabel(d.percent)
              }}</span>
              <StatusBadge
                :label="d.taken ? 'Taken' : d.date === data.today ? 'Not taken yet' : 'Not taken'"
                :tone="d.taken ? 'success' : d.date === data.today ? 'warning' : 'error'"
              />
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- By student -->
    <section v-else class="rounded-lg border bg-card">
      <div
        class="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(52px,0.5fr))] gap-3 border-b border-divider px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
      >
        <span>Student</span><span class="text-right">Present</span
        ><span class="text-right">Late</span><span class="text-right">Absent</span
        ><span class="text-right">Excused</span><span class="text-right">%</span>
      </div>
      <ul class="flex flex-col divide-y divide-divider">
        <li
          v-for="s in data.students"
          :key="s.studentId"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(52px,0.5fr))]"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate font-medium">{{ s.name }}</span>
            <span class="text-xs text-faint"
              >{{ s.admissionNo }} · {{ s.schoolDays }} days<template v-if="s.note">
                · {{ s.note }}</template
              ></span
            >
          </span>
          <span class="text-right tabular-nums max-md:hidden">{{ s.present }}</span>
          <span class="text-right tabular-nums max-md:hidden">{{ s.late }}</span>
          <span
            class="text-right tabular-nums max-md:hidden"
            :class="s.absent > 0 && 'text-error-strong'"
            >{{ s.absent }}</span
          >
          <span class="text-right tabular-nums max-md:hidden">{{ s.excused }}</span>
          <span
            class="text-right font-semibold tabular-nums"
            :class="s.percent !== null && s.percent < 90 && 'text-warning-strong'"
            >{{ percentLabel(s.percent) }}</span
          >
          <span class="col-span-2 text-xs text-muted-foreground md:hidden"
            >{{ s.present }} present · {{ s.late }} late · {{ s.absent }} absent ·
            {{ s.excused }} excused</span
          >
        </li>
      </ul>
    </section>
  </template>
</template>
