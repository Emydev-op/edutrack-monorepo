<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useAssignmentsQuery,
  useCopyAssignmentsMutation,
  useDeleteAssignmentMutation,
} from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { Assignment, AssignmentInput } from '@/types';

import AssignmentDrawer from './AssignmentDrawer.vue';

const context = useContextStore();
const confirm = useConfirm();
const { data: view, isPending } = useAssignmentsQuery(() => context.current.branch);
const copy = useCopyAssignmentsMutation();
const remove = useDeleteAssignmentMutation();

const search = useRouteQuery<string>('q', '');
const teacherFilter = useRouteQuery<string>('teacher', '');
const subjectFilter = useRouteQuery<string>('subject', '');

const drawer = ref(false);
const preset = ref<Partial<AssignmentInput> | undefined>();
function openDrawer(p?: Partial<AssignmentInput>) {
  preset.value = p;
  drawer.value = true;
}

const r = routesPath.academics;
const teachers = computed(() => view.value?.teachers ?? []);
const multiBranch = computed(() => new Set(view.value?.arms.map((a) => a.branch)).size > 1);
const loadOf = (id: string) => teachers.value.find((t) => t.id === id);

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (view.value?.assignments ?? [])
    .filter(
      (a) =>
        (!teacherFilter.value || a.teacher === teacherFilter.value) &&
        (!subjectFilter.value || a.subjectName === subjectFilter.value) &&
        (!q || `${a.teacher} ${a.subjectName} ${a.subject} ${a.arm}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.teacher.localeCompare(b.teacher) || a.arm.localeCompare(b.arm));
});

const columns = computed<Column[]>(() => [
  { key: 'teacher', label: 'Teacher', width: 'minmax(170px,1.3fr)' },
  { key: 'subjectName', label: 'Subject', width: 'minmax(150px,1.1fr)' },
  { key: 'arm', label: 'Class', width: '100px' },
  ...(multiBranch.value ? [{ key: 'branch', label: 'Branch', width: 'minmax(120px,0.9fr)' }] : []),
  { key: 'type', label: 'Type', width: 'minmax(130px,1fr)' },
  { key: 'periods', label: 'Periods', align: 'right' as const, width: '70px' },
  { key: 'load', label: 'Load', width: '90px' },
]);

const loadTone = (id: string) => {
  const t = loadOf(id);
  if (!t) return '';
  if (t.periods > t.maxPeriods) return 'text-error-strong font-semibold';
  if (t.periods >= t.maxPeriods - 2) return 'text-warning-strong font-medium';
  return '';
};

const slots = computed(() => {
  const v = view.value;
  if (!v) return { total: 0, filled: 0 };
  const total = v.arms.reduce((n, a) => n + a.subjects.length, 0);
  return { total, filled: v.assignments.length };
});

const gapSummary = computed(() =>
  (view.value?.gaps ?? [])
    .map((g) => `${g.subjectName} (${g.arms.map((a) => a.name).join(', ')})`)
    .join(' · '),
);

const workload = computed(() =>
  [...teachers.value]
    .filter((t) => t.periods || t.classTeacherOf.length)
    .sort((a, b) => b.periods / b.maxPeriods - a.periods / a.maxPeriods),
);
const idle = computed(() => teachers.value.filter((t) => !t.periods && !t.classTeacherOf.length));
const meterColor = (p: number, max: number) =>
  p > max ? 'var(--error)' : p >= max - 2 ? 'var(--warning)' : 'var(--primary)';

function copyPrevious() {
  void confirm({
    title: 'Copy assignments from the previous term?',
    details: [
      ['Copies', 'Every previous assignment whose class still offers the subject'],
      ['Keeps', 'Assignments you’ve already made this term'],
      ['Skips', 'Staff who have left, and subjects removed from the curriculum'],
    ],
    confirmLabel: 'Copy assignments',
    action: async () => {
      const res = await copy.mutateAsync();
      toast.success(
        res.copied
          ? `${res.copied} assignment${res.copied > 1 ? 's' : ''} copied from the previous term.`
          : 'Nothing to copy: every slot from last term is already filled.',
      );
    },
  });
}

function removeRow(a: Assignment) {
  void confirm({
    title: `Remove ${a.teacher} from ${a.arm} ${a.subjectName}?`,
    details: [
      ['After', `${a.arm} ${a.subjectName} has no teacher until you assign one`],
      ['Timetable', 'Lessons stay placed but show “No teacher”'],
    ],
    confirmLabel: 'Remove assignment',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(a.id);
      toast.success('Assignment removed.');
    },
  });
}

const actions = (a: Assignment) => [
  {
    label: 'Reassign',
    onSelect: () =>
      openDrawer({ teacherId: a.teacherId, subject: a.subject, armId: a.armId, type: a.type }),
  },
  { label: 'Remove', destructive: true, onSelect: () => removeRow(a) },
];

const empty = computed(() => {
  const v = view.value;
  if (!v) return null;
  if (!v.arms.length)
    return {
      title: 'No classes yet',
      text: 'Add class levels and arms before assigning teachers.',
      to: { name: r.classes.name },
      cta: 'Go to Classes & Arms',
    };
  if (!v.subjects.length)
    return {
      title: 'No subjects yet',
      text: 'Set up Subjects & Curriculum so each class knows what it offers.',
      to: { name: r.subjects.name },
      cta: 'Go to Subjects & Curriculum',
    };
  if (!v.teachers.length)
    return {
      title: 'No teaching staff yet',
      text: 'Add teachers in the Staff module first. They appear here once they’re on your staff list.',
      to: { name: routesPath.staff.directory.name },
      cta: 'Go to Staff Directory',
    };
  return null;
});
</script>

<template>
  <PageHeader
    title="Teacher Assignments"
    :description="`Assignments · ${context.current.session} · ${context.current.term} · ${context.current.branch}`"
  >
    <template #actions>
      <Button
        v-if="view?.canCopyPrevious"
        variant="outline"
        :disabled="!!empty || copy.isPending.value"
        @click="copyPrevious"
        >Copy from previous term</Button
      >
      <Button :disabled="!!empty" @click="openDrawer()">Add assignment</Button>
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-96" />
  <template v-else-if="view">
    <SetupStepBar
      step="teacher-assignments"
      :details="[
        ['Subjects', `${slots.filled} of ${slots.total} slots assigned`],
        [
          'Class teachers',
          view.armsWithoutClassTeacher.length
            ? `${view.armsWithoutClassTeacher.length} arm${view.armsWithoutClassTeacher.length > 1 ? 's' : ''} without one`
            : 'All arms covered',
        ],
        ['Teachers notified', 'They see these classes in the Teacher Workspace'],
      ]"
      :blocked="
        empty
          ? empty.text
          : !view.assignments.length
            ? 'Assign at least one subject to a teacher first.'
            : ''
      "
    />

    <EmptyState v-if="empty" :title="empty.title" :description="empty.text">
      <Button as-child
        ><RouterLink :to="empty.to">{{ empty.cta }}</RouterLink></Button
      >
    </EmptyState>

    <template v-else>
      <InlineNotice
        v-if="view.gaps.length"
        tone="error"
        title="Subjects without a teacher"
        :description="gapSummary"
      >
        <template #action>
          <Button
            variant="outline"
            size="sm"
            @click="
              openDrawer({ subject: view.gaps[0]!.subject, armId: view.gaps[0]!.arms[0]!.id })
            "
            >Assign</Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-if="view.armsWithoutClassTeacher.length"
        tone="warning"
        :title="`${view.armsWithoutClassTeacher.length === 1 ? 'Class' : `${view.armsWithoutClassTeacher.length} classes`} without a class teacher`"
        :description="`${view.armsWithoutClassTeacher.map((a) => a.name).join(', ')} · report card comments and promotion proposals need a class teacher.`"
      >
        <template #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink
              :to="{
                name: r.classDetail.name,
                params: { id: view.armsWithoutClassTeacher[0]!.id },
              }"
              >Set for {{ view.armsWithoutClassTeacher[0]!.name }}</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-if="idle.length && view.assignments.length"
        tone="neutral"
        :title="`${idle.length} teacher${idle.length > 1 ? 's have' : ' has'} no assignments`"
        :description="`${idle.map((t) => t.name).join(', ')}. They’ll see an empty Teacher Workspace.`"
      />

      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <DataTable
          :columns="columns"
          :rows="rows"
          :row-key="(a) => a.id"
          :row-label="(a) => `${a.teacher} · ${a.subjectName} · ${a.arm}`"
          :actions="actions"
          :empty-text="
            view.assignments.length
              ? 'No assignments match your search.'
              : 'No assignments yet. Add one, or copy from the previous term.'
          "
        >
          <template #search>
            <SearchInput v-model="search" placeholder="Search teacher, subject or class" />
          </template>
          <template #filters>
            <FilterMenu
              v-model="teacherFilter"
              label="Teacher"
              :options="[...new Set(view.assignments.map((a) => a.teacher))].sort()"
            />
            <FilterMenu
              v-model="subjectFilter"
              label="Subject"
              :options="[...new Set(view.assignments.map((a) => a.subjectName))].sort()"
            />
          </template>
          <template #cell-teacher="{ row }">
            <span class="flex flex-col">
              <span class="font-medium">{{ row.teacher }}</span>
              <span
                v-if="loadOf(row.teacherId)?.classTeacherOf.length"
                class="text-xs text-muted-foreground"
                >Class teacher {{ loadOf(row.teacherId)!.classTeacherOf.join(', ') }}</span
              >
            </span>
          </template>
          <template #cell-arm="{ row }">
            <RouterLink
              :to="{ name: r.classDetail.name, params: { id: row.armId } }"
              class="font-medium text-primary hover:underline"
              >{{ row.arm }}</RouterLink
            >
          </template>
          <template #cell-load="{ row }">
            <span :class="cn('tabular-nums', loadTone(row.teacherId))"
              >{{ loadOf(row.teacherId)?.periods ?? 0 }} /
              {{ loadOf(row.teacherId)?.maxPeriods ?? 0 }}</span
            >
          </template>
        </DataTable>

        <SectionCard
          title="Workload"
          description="Periods per week across all branches. Full-time teachers default to 28."
        >
          <div class="flex flex-col gap-2.5">
            <MeterRow
              v-for="t in workload"
              :key="t.id"
              :label="t.name"
              label-width="150px"
              value-width="70px"
              :percent="Math.min(100, (t.periods / t.maxPeriods) * 100)"
              :value="`${t.periods} / ${t.maxPeriods}`"
              :color="meterColor(t.periods, t.maxPeriods)"
            />
            <p v-if="!workload.length" class="text-[13px] text-muted-foreground">
              Nobody is assigned yet.
            </p>
          </div>
        </SectionCard>
      </div>
    </template>

    <AssignmentDrawer v-model:open="drawer" :view="view" :preset="preset" />
  </template>
</template>
