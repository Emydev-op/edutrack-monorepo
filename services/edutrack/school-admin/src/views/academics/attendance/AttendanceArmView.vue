<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { TONE_CLASSES } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useAttendanceArmQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';
import type { AttendanceDay, AttendanceMark } from '@/types';

import { dayLabel, pct, rateTone } from './attendance-format';

const route = useRoute();
const context = useContextStore();
const layout = useLayoutStore();
const armId = computed(() => String(route.params.armId));
const { data, isPending, error, refetch } = useAttendanceArmQuery(armId, () => ({
  term: context.current.term,
}));

watch(data, (d) => layout.setRecordLabel(d ? d.arm : null), { immediate: true });

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
/** Weeks of the term, Monday to Friday. */
const weeks = computed(() => {
  const out: { label: string; days: (AttendanceDay | null)[] }[] = [];
  for (const d of data.value?.days ?? []) {
    const wd = new Date(`${d.date}T00:00:00`).getDay() - 1;
    if (wd === 0 || !out.length) out.push({ label: '', days: [null, null, null, null, null] });
    const week = out[out.length - 1]!;
    week.days[wd] = d;
    if (!week.label) week.label = dayLabel(d.date, false);
  }
  return out;
});

const selectedDate = ref('');
watch(
  data,
  (d) => {
    if (!d || d.days.some((x) => x.date === selectedDate.value)) return;
    const past = d.days.filter((x) => x.kind === 'school');
    selectedDate.value =
      (past.find((x) => x.date === d.today) ?? past[past.length - 1])?.date ?? '';
  },
  { immediate: true },
);
const selected = computed(() => data.value?.days.find((d) => d.date === selectedDate.value));

function cellClass(d: AttendanceDay) {
  if (d.kind === 'closed') return 'bg-muted text-faint';
  if (d.kind === 'upcoming') return 'border border-dashed text-faint';
  if (!d.taken) return cn('border border-error bg-card', TONE_CLASSES.error.text);
  const t = TONE_CLASSES[(d.rate ?? 0) >= 90 ? 'success' : 'warning'];
  return cn(t.surface, t.text);
}
function cellTitle(d: AttendanceDay) {
  const day = dayLabel(d.date);
  if (d.kind === 'closed') return `${day}: no school · ${d.note}`;
  if (d.kind === 'upcoming') return `${day}: school day ahead`;
  if (!d.taken) return `${day}: register not taken`;
  return `${day}: ${pct(d.rate)} · taken by ${d.takenBy} at ${d.takenAt}`;
}

const MARK_TONE: Record<AttendanceMark, 'success' | 'warning' | 'error' | 'info'> = {
  Present: 'success',
  Late: 'warning',
  Absent: 'error',
  Excused: 'info',
};
const dayMarks = computed(() =>
  (data.value?.students ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    mark: selected.value ? s.marks[selected.value.date] : undefined,
  })),
);

const columns: Column[] = [
  { key: 'name', label: 'Student', width: 'minmax(170px,1.6fr)' },
  { key: 'rate', label: 'Attendance', align: 'right', width: '100px' },
  { key: 'present', label: 'Present', align: 'right', width: '76px' },
  { key: 'late', label: 'Late', align: 'right', width: '64px' },
  { key: 'absent', label: 'Absent', align: 'right', width: '70px' },
  { key: 'excused', label: 'Excused', align: 'right', width: '76px' },
  { key: 'marked', label: 'Days marked', align: 'right', width: '100px' },
];
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="This class’s attendance can’t be shown"
    :description="getApiErrorMessage(error)"
  >
    <template #action>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="refetch()">Retry</Button>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.academics.attendance.name }"
            >Back to attendance</RouterLink
          ></Button
        >
      </div>
    </template>
  </InlineNotice>
  <template v-else-if="data">
    <PageHeader
      :title="`${data.arm} attendance`"
      :description="`${data.term} · ${data.branch} · Class teacher: ${data.classTeacher ?? 'none'}`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink
            :to="{ name: routesPath.academics.classDetail.name, params: { id: data.armId } }"
            >Open class</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="!data.summary.students"
      tone="neutral"
      :title="`No students in ${data.arm}`"
      description="There is no register to take until students are placed in this arm."
    />
    <InlineNotice
      v-else-if="!data.classTeacher"
      tone="warning"
      :title="`${data.arm} has no class teacher`"
      description="The daily register is taken by the class teacher, so nobody is taking it. Assign a class teacher in Classes & Arms."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.academics.classes.name }"
            >Classes & Arms</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>

    <MetricGrid>
      <MetricCard
        label="Attendance"
        :value="pct(data.summary.rate)"
        hint="Present or late, on days taken"
      />
      <MetricCard
        label="Days taken"
        :value="`${data.summary.daysTaken} / ${data.summary.schoolDays}`"
        hint="School days so far"
      />
      <MetricCard
        label="Not taken"
        :value="data.summary.notTaken"
        :hint="data.summary.notTaken ? 'Days with no register' : 'Every register taken'"
        :hint-tone="data.summary.notTaken ? 'warning' : 'success'"
      />
      <MetricCard
        label="Students"
        :value="data.summary.students"
        :hint="data.others ? `${data.others} without a record on EduTrack` : undefined"
      />
    </MetricGrid>

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <SectionCard title="Daily register" description="Tap a day to see who was marked what.">
        <div class="flex flex-col gap-1.5" role="grid" :aria-label="`${data.arm} registers by day`">
          <div
            class="grid grid-cols-[52px_repeat(5,minmax(0,1fr))] gap-1 text-[11px] font-medium text-faint"
            role="row"
          >
            <span role="columnheader">Week of</span>
            <span v-for="w in WEEKDAYS" :key="w" role="columnheader" class="text-center">{{
              w
            }}</span>
          </div>
          <div
            v-for="w in weeks"
            :key="w.label"
            class="grid grid-cols-[52px_repeat(5,minmax(0,1fr))] gap-1"
            role="row"
          >
            <span class="self-center text-[11px] text-faint" role="rowheader">{{ w.label }}</span>
            <template v-for="(d, i) in w.days" :key="d?.date ?? i">
              <span v-if="!d" role="gridcell" />
              <button
                v-else
                type="button"
                role="gridcell"
                :title="cellTitle(d)"
                :aria-label="cellTitle(d)"
                :aria-selected="selectedDate === d.date"
                :disabled="d.kind !== 'school'"
                :class="
                  cn(
                    'flex h-9 flex-col items-center justify-center rounded-sm text-[11px] leading-tight tabular-nums',
                    cellClass(d),
                    d.kind === 'school' && 'hover:ring-1 hover:ring-primary',
                    selectedDate === d.date && 'ring-2 ring-primary',
                  )
                "
                @click="selectedDate = d.date"
              >
                <span class="font-medium">{{ Number(d.date.slice(8)) }}</span>
                <span v-if="d.kind === 'school'" class="text-[10px]">{{
                  d.taken ? pct(d.rate === null ? null : Math.round(d.rate)) : '—'
                }}</span>
              </button>
            </template>
          </div>
        </div>
        <ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li class="flex items-center gap-1">
            <span :class="cn('size-3 rounded-sm', TONE_CLASSES.success.surface)" />90% or more
          </li>
          <li class="flex items-center gap-1">
            <span :class="cn('size-3 rounded-sm', TONE_CLASSES.warning.surface)" />Below 90%
          </li>
          <li class="flex items-center gap-1">
            <span class="size-3 rounded-sm border border-error bg-card" />Not taken
          </li>
          <li class="flex items-center gap-1">
            <span class="size-3 rounded-sm bg-muted" />No school
          </li>
          <li class="flex items-center gap-1">
            <span class="size-3 rounded-sm border border-dashed" />Ahead
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        :title="selected ? dayLabel(selected.date) : 'No school days yet'"
        :description="
          !selected
            ? 'Registers start on the first school day of the term.'
            : selected.taken
              ? `Taken by ${selected.takenBy} at ${selected.takenAt}`
              : 'The register wasn’t taken this day.'
        "
      >
        <template v-if="selected?.taken">
          <dl class="mb-3 grid grid-cols-4 gap-2 text-center text-[13px]">
            <div
              v-for="[k, v] in [
                ['Present', selected.present],
                ['Late', selected.late],
                ['Absent', selected.absent],
                ['Excused', selected.excused],
              ]"
              :key="k"
              class="rounded-md bg-muted px-1 py-1.5"
            >
              <dt class="text-[11px] text-faint">{{ k }}</dt>
              <dd class="font-semibold tabular-nums">{{ v }}</dd>
            </div>
          </dl>
          <ul v-if="dayMarks.length" class="flex flex-col divide-y divide-divider text-[13px]">
            <li
              v-for="m in dayMarks"
              :key="m.id"
              class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5"
            >
              <span class="min-w-0">{{ m.name }}</span>
              <span class="flex items-center gap-2">
                <span v-if="m.mark?.reason" class="text-xs text-muted-foreground">{{
                  m.mark.reason
                }}</span>
                <StatusBadge
                  v-if="m.mark"
                  :label="m.mark.status"
                  :tone="MARK_TONE[m.mark.status]"
                />
                <span v-else class="text-xs text-faint">Not marked</span>
              </span>
            </li>
          </ul>
          <p v-if="data.others" class="mt-2 text-xs text-muted-foreground">
            The totals include {{ data.others }} students counted without a record on EduTrack.
          </p>
        </template>
      </SectionCard>
    </div>

    <DataTable
      title="Students"
      :description="
        data.others
          ? `This term so far · ${data.others} more counted without a record on EduTrack`
          : 'This term so far'
      "
      :columns="columns"
      :rows="data.students"
      :row-key="(s) => s.id"
      :empty-text="
        data.others
          ? `${data.others} students are counted in this arm but have no record on EduTrack yet, so there is no per-student attendance.`
          : 'No students are placed in this arm.'
      "
    >
      <template #cell-name="{ row }">
        <span class="flex flex-col">
          <CellLink
            :to="{ name: routesPath.students.detail.name, params: { id: row.id } }"
            :label="row.name"
            :detail="row.admissionNo"
          />
        </span>
      </template>
      <template #cell-rate="{ row }">
        <span
          :class="
            cn(
              'font-medium tabular-nums',
              row.rate !== null && TONE_CLASSES[rateTone(row.rate)].text,
            )
          "
          >{{ pct(row.rate) }}</span
        >
      </template>
    </DataTable>
  </template>
</template>
