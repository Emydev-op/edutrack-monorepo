<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';

import { useTermContext } from '@/composables/useTermContext';
import { daysBetween, formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import type { TeachingClassDetail } from '@/types';

const props = defineProps<{ detail: TeachingClassDetail }>();
const { today } = useTermContext();
const c = computed(() => props.detail.class);
const next = computed(() => props.detail.nextLesson);

const nextLabel = computed(() => {
  const n = next.value;
  if (!n) return props.detail.readOnly ? 'Term over' : 'None left this term';
  if (n.inProgress) return 'Now';
  const days = daysBetween(today.value, n.date);
  return days === 0
    ? `Today ${n.start}`
    : days === 1
      ? `Tomorrow ${n.start}`
      : `${n.day} ${n.start}`;
});
const nextHint = computed(() => {
  const n = next.value;
  if (!n) return undefined;
  return `${formatWeekday(n.date, { year: false })} · ${n.periodLabel} · ${n.start}–${n.end}`;
});
const res = computed(() => props.detail.results);
const studentLink = (id: string) => ({
  name: routesPath.teaching.student.name,
  params: { studentId: id },
});
const joinedLate = computed(() => props.detail.students.filter((s) => s.joinedLate).length);
const r = routesPath;
</script>

<template>
  <MetricGrid>
    <MetricCard
      label="Students"
      :value="c.students"
      :hint="joinedLate ? `${joinedLate} joined during the term` : 'Taking this subject'"
    />
    <MetricCard label="Periods a week" :value="c.periodsPerWeek" :hint="c.rooms.join(', ')" />
    <MetricCard
      label="Next lesson"
      :value="nextLabel"
      :hint="nextHint"
      :hint-tone="next?.inProgress ? 'success' : 'neutral'"
      :to="next ? { name: r.teaching.lesson.name, params: { lessonId: next.lessonId } } : undefined"
    />
  </MetricGrid>
  <SectionCard
    v-if="res"
    title="Results so far"
    :description="`From the score sheet · pass mark ${res.passMark}`"
  >
    <template #actions>
      <SheetStatusBadge :status="res.sheet.status" :with-hod="res.sheet.withHod" />
    </template>
    <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] lg:grid-cols-4">
      <div class="flex flex-col">
        <dt class="text-xs text-faint">Average</dt>
        <dd class="font-semibold tabular-nums">
          {{ res.sheet.average === null ? '—' : res.sheet.average.toFixed(1) }}
        </dd>
      </div>
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Highest</dt>
        <dd v-if="res.highest" class="min-w-0">
          <RouterLink :to="studentLink(res.highest.studentId)" class="hover:underline"
            ><span class="font-semibold tabular-nums">{{ res.highest.total }}</span>
            <span class="text-muted-foreground"> · {{ res.highest.name }}</span></RouterLink
          >
        </dd>
        <dd v-else class="text-faint">No complete totals yet</dd>
      </div>
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Needs support</dt>
        <dd v-if="res.needsSupport.length" class="flex flex-col">
          <RouterLink
            v-for="st in res.needsSupport"
            :key="st.studentId"
            :to="studentLink(st.studentId)"
            class="truncate hover:underline"
            ><span class="font-semibold text-error-strong tabular-nums">{{ st.total }}</span>
            <span class="text-muted-foreground"> · {{ st.name }}</span></RouterLink
          >
        </dd>
        <dd v-else class="text-faint">No one below {{ res.passMark }}</dd>
      </div>
      <div class="flex min-w-0 flex-col">
        <dt class="text-xs text-faint">Absent from exam</dt>
        <dd v-if="res.absentFromExam.length" class="flex flex-col">
          <RouterLink
            v-for="st in res.absentFromExam"
            :key="st.studentId"
            :to="studentLink(st.studentId)"
            class="truncate hover:underline"
            >{{ st.name }}</RouterLink
          >
        </dd>
        <dd v-else class="text-faint">None</dd>
      </div>
    </dl>
  </SectionCard>
  <div class="grid gap-4 md:grid-cols-2">
    <KeyValueCard
      title="Class"
      :rows="[
        { label: 'Class', value: c.armName },
        { label: 'Section', value: c.section },
        { label: 'Campus', value: c.branchName },
        { label: 'Class teacher', value: detail.classTeacher?.name ?? 'Not assigned' },
        { label: c.rooms.length > 1 ? 'Rooms' : 'Room', value: c.rooms.join(', ') },
      ]"
    />
    <KeyValueCard
      title="Subject"
      :rows="[
        { label: 'Subject', value: c.subjectName },
        { label: 'Department', value: detail.department.name },
        {
          label: 'HOD',
          value: detail.department.hod ?? 'No HOD · sheets go to the academic office',
        },
        {
          label: 'My role',
          value: c.isClassTeacher ? `${c.role} · also class teacher` : c.role,
        },
      ]"
    >
      <template #action>
        <Button as-child variant="ghost" size="sm"
          ><RouterLink :to="{ name: r.teaching.subject.name, params: { subject: c.subject } }"
            >Open subject</RouterLink
          ></Button
        >
      </template>
    </KeyValueCard>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button v-if="!detail.readOnly" as-child variant="outline" size="sm"
      ><RouterLink
        :to="{ name: r.assignments.new.name, query: { class: c.armId, subject: c.subject } }"
        >Create assignment</RouterLink
      ></Button
    >
    <Button v-if="!detail.readOnly" as-child variant="outline" size="sm"
      ><RouterLink
        :to="{ name: r.materials.upload.name, query: { class: c.armId, subject: c.subject } }"
        >Upload material</RouterLink
      ></Button
    >
    <Button as-child variant="outline" size="sm"
      ><RouterLink :to="{ name: r.teaching.timetable.name }">Timetable</RouterLink></Button
    >
  </div>
</template>
