<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { TONE_CLASSES } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useAttendanceQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { AttendanceArmRow } from '@/types';

import { dayLabel, pct, rateTone } from './attendance-format';

const context = useContextStore();
const { data, isPending, error, refetch } = useAttendanceQuery(() => ({
  term: context.current.term,
  branch: context.current.branch,
}));
const section = useRouteQuery<string>('section', 'All');

const allBranches = computed(() => new Set(data.value?.rows.map((r) => r.branch)).size > 1);
const sections = computed(() => [...new Set(data.value?.rows.map((r) => r.section) ?? [])]);
const rows = computed(() =>
  (data.value?.rows ?? []).filter((r) => section.value === 'All' || r.section === section.value),
);
const notTakenArms = computed(() => rows.value.filter((r) => r.notTaken > 0));
const todayTaken = computed(() => rows.value.filter((r) => r.todayTaken).length);
/** Arms with students: the ones that have a register to take. */
const withStudents = computed(() => rows.value.filter((r) => r.students > 0));
const todayClosure = computed(() => data.value?.closures.find((c) => c.date === data.value?.today));
const upcoming = computed(() =>
  (data.value?.closures ?? []).filter((c) => c.date >= (data.value?.today ?? '')).slice(0, 4),
);

const columns: Column[] = [
  { key: 'arm', label: 'Class', width: 'minmax(120px,1fr)' },
  { key: 'classTeacher', label: 'Class teacher', width: 'minmax(160px,1.3fr)' },
  { key: 'rate', label: 'Attendance', align: 'right', width: '100px' },
  { key: 'daysTaken', label: 'Days taken', align: 'right', width: '100px' },
  { key: 'notTaken', label: 'Not taken', align: 'right', width: '90px' },
  { key: 'todayTaken', label: 'Today', width: '110px' },
];

function exportCsv() {
  const d = data.value;
  if (!d) return;
  downloadCsv(
    `attendance-${d.term.toLowerCase().replace(/\s+/g, '-')}.csv`,
    [
      'Class',
      'Branch',
      'Class teacher',
      'Students',
      'School days',
      'Days taken',
      'Not taken',
      'Present',
      'Late',
      'Absent',
      'Excused',
      'Attendance %',
    ],
    rows.value.map((r: AttendanceArmRow) => [
      r.arm,
      r.branch,
      r.classTeacher ?? 'No class teacher',
      r.students,
      r.schoolDays,
      r.daysTaken,
      r.notTaken,
      r.present,
      r.late,
      r.absent,
      r.excused,
      r.rate ?? '',
    ]),
  );
}
</script>

<template>
  <PageHeader
    title="Attendance"
    :description="`Attendance · ${data?.term || context.current.term} · ${data?.session || context.current.session} · ${context.current.branch}`"
  >
    <template #actions>
      <Button variant="outline" :disabled="!rows.length" @click="exportCsv">Export CSV</Button>
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Attendance couldn’t load"
    :description="getApiErrorMessage(error)"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <template v-else-if="data">
    <EmptyState
      v-if="data.empty === 'no-session'"
      title="No academic session yet"
      description="Attendance follows the term calendar. Create a session and its terms first."
    >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.sessions.name }"
          >Open Sessions & Terms</RouterLink
        ></Button
      >
    </EmptyState>
    <EmptyState
      v-else-if="data.empty === 'no-classes'"
      title="No classes yet"
      description="Class teachers take the daily register for their arm. Add class levels and arms, and give each arm a class teacher."
    >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.classes.name }"
          >Go to Classes & Arms</RouterLink
        ></Button
      >
    </EmptyState>
    <template v-else>
      <p class="text-[13px] text-muted-foreground">
        Class teachers take the daily register in the Teacher Workspace. This view is read-only.
        Present or late counts as attended; days not taken are left out of the percentage.
      </p>

      <MetricGrid>
        <MetricCard
          label="Attendance"
          :value="pct(data.totals?.rate ?? null)"
          hint="Present or late, on days taken"
          :hint-tone="rateTone(data.totals?.rate ?? null) === 'success' ? 'success' : 'warning'"
        />
        <MetricCard
          label="School days so far"
          :value="data.schoolDays"
          :hint="`${data.term} · weekends and closures left out`"
        />
        <MetricCard
          label="Registers not taken"
          :value="rows.reduce((n, r) => n + r.notTaken, 0)"
          :hint="
            notTakenArms.length
              ? `In ${notTakenArms.length} of ${withStudents.length} classes`
              : 'Every register taken'
          "
          :hint-tone="notTakenArms.length ? 'warning' : 'success'"
        />
        <MetricCard
          label="Today"
          :value="data.isSchoolDay ? `${todayTaken} of ${withStudents.length}` : 'No school'"
          :hint="
            data.isSchoolDay
              ? `registers taken · ${dayLabel(data.today)}`
              : (todayClosure?.name ?? `${dayLabel(data.today)} isn’t a school day`)
          "
          :hint-tone="data.isSchoolDay && todayTaken < withStudents.length ? 'warning' : 'neutral'"
        />
      </MetricGrid>

      <InlineNotice
        v-if="data.schoolDays === 0"
        tone="info"
        :title="`${data.term} hasn’t started`"
        description="Registers start on the first school day of the term."
      />

      <EmptyState
        v-if="!data.rows.length"
        title="No classes at this branch"
        :description="`There are no class arms at ${context.current.branch}. Switch branch or add arms in Classes & Arms.`"
      />
      <DataTable
        v-else
        title="Classes"
        :description="`${rows.length} class arm${rows.length === 1 ? '' : 's'} · open one to see each day and each student`"
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.armId"
        empty-text="No classes in this section."
      >
        <template v-if="sections.length > 1" #filters>
          <SegmentedControl
            v-model="section"
            label="Section"
            :options="[
              { value: 'All', label: 'All sections' },
              ...sections.map((s) => ({ value: s, label: s })),
            ]"
          />
        </template>
        <template #cell-arm="{ row }">
          <span class="flex flex-col">
            <CellLink
              :to="{
                name: routesPath.academics.attendanceArm.name,
                params: { armId: row.armId },
              }"
              :label="row.arm"
              :detail="
                allBranches
                  ? `${row.branch} · ${pluralize(row.students, 'student')}`
                  : pluralize(row.students, 'student')
              "
            />
          </span>
        </template>
        <template #cell-classTeacher="{ row }">
          <span :class="!row.classTeacher && 'text-error-strong'">{{
            row.classTeacher ?? 'No class teacher'
          }}</span>
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
        <template #cell-daysTaken="{ row }">
          <span v-if="row.students" class="tabular-nums"
            >{{ row.daysTaken }} / {{ row.schoolDays }}</span
          >
          <span v-else class="text-xs text-faint">No students</span>
        </template>
        <template #cell-notTaken="{ row }">
          <span :class="cn('tabular-nums', row.notTaken && 'font-medium text-error-strong')">{{
            row.notTaken
          }}</span>
        </template>
        <template #cell-todayTaken="{ row }">
          <StatusBadge
            v-if="row.todayTaken !== null"
            :label="row.todayTaken ? 'Taken' : 'Not taken'"
            :tone="row.todayTaken ? 'success' : 'warning'"
          />
          <span v-else class="text-xs text-faint">{{
            !row.students ? '—' : data.isSchoolDay ? '' : 'No school'
          }}</span>
        </template>
      </DataTable>

      <SectionCard
        v-if="upcoming.length"
        title="Coming up: no school"
        description="From the academic calendar. These days aren’t counted as school days."
      >
        <ul class="flex flex-col gap-1.5 text-[13px]">
          <li v-for="c in upcoming" :key="c.date" class="flex flex-wrap justify-between gap-2">
            <span class="font-medium">{{ dayLabel(c.date) }}</span>
            <span class="text-muted-foreground">{{ c.name }}</span>
          </li>
        </ul>
      </SectionCard>
    </template>
  </template>
</template>
