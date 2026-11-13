<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { LockIcon } from '@lucide/vue';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useTeachingStudentQuery } from '@/api/services/teaching';
import StudentAssignmentsTable from '@/components/assignments/StudentAssignmentsTable.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { sheetStatusLabel } from '@/components/results/sheet-status';
import TeachingQueryError from '@/components/teaching/TeachingQueryError.vue';
import { useTermContext } from '@/composables/useTermContext';
import { formatDay } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const { term } = useTermContext();
const id = computed(() => String(route.params.studentId));
const { data: s, isPending, error, refetch } = useTeachingStudentQuery(id);
watch(s, (x) => layout.setRecordLabel(x?.name ?? null), { immediate: true });

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');

/** A score as words: a number, Absent (ABS), Exempt (EXM) or Missing (blank, never zero). */
const scoreText = (v: number | 'ABS' | 'EXM' | null) =>
  v === null ? 'Missing' : v === 'ABS' ? 'Absent' : v === 'EXM' ? 'Exempt' : String(v);
const scoreClass = (v: number | 'ABS' | 'EXM' | null) =>
  v === null
    ? 'text-warning-strong'
    : v === 'ABS'
      ? 'text-error-strong'
      : v === 'EXM'
        ? 'text-muted-foreground'
        : 'font-semibold tabular-nums';

/** Opens the sheet on this student, at their first missing score (or the first component). */
const sheetLink = (row: NonNullable<typeof s.value>['scores'][number]) => {
  const i = row.scores.findIndex((v) => v === null);
  return {
    name: routesPath.results.sheet.name,
    params: { sheetId: row.sheetId },
    query: { focus: row.components[Math.max(0, i)]?.key, student: s.value!.id },
  };
};

const attendanceRows = computed(() => {
  const a = s.value?.attendance;
  if (!a) return [];
  return [
    { label: 'Present', value: a.present },
    { label: 'Late', value: a.late },
    { label: 'Absent', value: a.absent },
    { label: 'Excused', value: a.excused },
  ];
});
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-64" /></template>
  <TeachingQueryError
    v-else-if="error || !s"
    :error="error"
    what="this student"
    not-found-title="This student wasn’t found"
    :back="{ label: 'Students', to: { name: routesPath.teaching.students.name } }"
    reason="They aren’t one of your students for the selected term."
    @retry="refetch()"
  />
  <template v-else>
    <PageHeader
      :title="s.name"
      :initials="initials(s.name)"
      :status="s.status === 'Transferred' ? 'Transferred' : undefined"
      :description="`${s.armName} · ${s.branchName} · ${term?.label ?? ''}`"
      :meta="[
        { label: 'Admission no.', value: s.admissionNo },
        ...(s.joinedLate ? [{ label: 'Joined', value: formatDay(s.joinedLate) }] : []),
      ]"
    />
    <InlineNotice
      v-if="s.leftOn"
      tone="warning"
      :title="`Left the school on ${formatDay(s.leftOn)}`"
      description="Transferred to another school. Their records stay for history and are read-only."
    />
    <div class="grid gap-4 md:grid-cols-2">
      <KeyValueCard
        title="Overview"
        :rows="[
          { label: 'Class', value: `${s.armName} · ${s.section}` },
          { label: 'Campus', value: s.branchName },
          { label: 'Admission no.', value: s.admissionNo },
          { label: 'Gender', value: s.gender },
          { label: 'At the school since', value: formatDay(s.joinedSchool) },
          ...(s.joinedLate ? [{ label: 'Joined this class', value: formatDay(s.joinedLate) }] : []),
          {
            label: 'Class teacher',
            value: s.isMyClassStudent ? 'You' : (s.classTeacher?.name ?? 'Not assigned'),
          },
        ]"
      />
      <SectionCard title="My subjects" :description="term?.label">
        <p v-if="!s.mySubjects.length" class="text-[13px] text-muted-foreground">
          {{
            s.leftOn
              ? 'They’re no longer in your subject lists because they left. You see them as their class teacher.'
              : 'You don’t teach this student a subject this term; you see them as their class teacher.'
          }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-divider">
          <li
            v-for="sub in s.mySubjects"
            :key="sub.code"
            class="flex items-center justify-between gap-3 py-2 text-[13px]"
          >
            <span class="min-w-0 truncate font-medium">{{ sub.name }}</span>
            <Button as-child variant="ghost" size="sm"
              ><RouterLink
                :to="{
                  name: routesPath.teaching.class.name,
                  params: { armId: sub.armId, subject: sub.code },
                }"
                >Open class</RouterLink
              ></Button
            >
          </li>
        </ul>
      </SectionCard>
    </div>
    <StudentAssignmentsTable v-if="s.mySubjects.length" :student-id="s.id" title="Assignments" />

    <div class="grid gap-4 md:grid-cols-2">
      <SectionCard
        title="Scores"
        :description="`Per component, for your subjects · ${term?.name ?? ''}`"
        flush
      >
        <p v-if="!s.scores.length" class="px-4 py-5 text-[13px] text-muted-foreground">
          {{
            s.mySubjects.length
              ? 'No score sheet for your subjects this term.'
              : 'You don’t teach this student a subject this term.'
          }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-divider">
          <li v-for="row in s.scores" :key="row.sheetId" class="flex flex-col gap-2 px-4 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-[13px] font-medium">{{ row.subjectName }}</span>
              <span class="flex items-center gap-2">
                <SheetStatusBadge :status="row.status" :with-hod="row.withHod" />
                <RouterLink
                  :to="sheetLink(row)"
                  class="text-[13px] font-medium text-primary hover:underline"
                  >Open in sheet</RouterLink
                >
              </span>
            </div>
            <dl class="grid grid-cols-3 gap-2 text-[13px]">
              <div v-for="(c, i) in row.components" :key="c.key" class="flex flex-col">
                <dt class="text-xs text-faint">{{ c.name }} · /{{ c.max }}</dt>
                <dd :class="scoreClass(row.scores[i] ?? null)">
                  {{ scoreText(row.scores[i] ?? null) }}
                </dd>
              </div>
            </dl>
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Results"
        description="Totals show once the academic office approves the sheet."
        flush
      >
        <p v-if="!s.results.length" class="px-4 py-5 text-[13px] text-muted-foreground">
          No results for your subjects this term.
        </p>
        <ul v-else class="flex flex-col divide-y divide-divider">
          <li
            v-for="res in s.results"
            :key="res.subject"
            class="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
          >
            <span class="min-w-0 truncate font-medium">{{ res.subjectName }}</span>
            <span v-if="res.total !== null" class="tabular-nums"
              ><b class="font-semibold">{{ res.total }}</b> · {{ res.grade }}</span
            >
            <span v-else class="text-muted-foreground"
              >Pending · {{ sheetStatusLabel(res.status, res.withHod) }}</span
            >
          </li>
        </ul>
        <template v-for="past in s.pastResults" :key="past.termId">
          <p
            class="flex items-center gap-1.5 border-t border-divider bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <LockIcon class="size-3 shrink-0" aria-hidden="true" /> {{ past.label }} · published,
            read-only
          </p>
          <ul class="flex flex-col divide-y divide-divider">
            <li
              v-for="res in past.results"
              :key="res.subject"
              class="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
            >
              <span class="min-w-0 truncate">{{ res.subjectName }}</span>
              <span class="tabular-nums"
                ><b class="font-semibold">{{ res.total ?? '—' }}</b> · {{ res.grade ?? '—' }}</span
              >
            </li>
          </ul>
        </template>
      </SectionCard>
    </div>

    <SectionCard
      title="Attendance"
      :description="`${term?.name ?? 'This term'} · ${s.attendance.schoolDays} school days so far · from the class register`"
    >
      <p v-if="!s.attendance.schoolDays" class="text-[13px] text-muted-foreground">
        No register days recorded for {{ s.firstName }} in this term yet.
      </p>
      <dl v-else class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-5">
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Attendance</dt>
          <dd class="font-semibold tabular-nums">
            {{ s.attendance.percent === null ? '—' : `${s.attendance.percent}%` }}
          </dd>
        </div>
        <div v-for="a in attendanceRows" :key="a.label" class="flex flex-col">
          <dt class="text-xs text-faint">{{ a.label }}</dt>
          <dd class="tabular-nums">{{ a.value }} day{{ a.value === 1 ? '' : 's' }}</dd>
        </div>
      </dl>
    </SectionCard>
    <p class="flex items-center gap-1.5 text-xs text-faint">
      <LockIcon class="size-3.5 shrink-0" aria-hidden="true" />
      Fees, guardians’ contacts and documents aren’t shown in the Teacher Workspace. Ask the school
      office if you need them.
    </p>
  </template>
</template>
