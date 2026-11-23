<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref } from 'vue';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useStudentSubjectsQuery } from '@/api/services/students';
import type { StudentDetail, TaughtSubject } from '@/types';

import ChangeSubjectsDrawer from '../ChangeSubjectsDrawer.vue';

const props = defineProps<{ student: StudentDetail }>();
const { data: view, isPending, error } = useStudentSubjectsQuery(() => props.student.id);
const changing = ref(false);

/** Medical notes come back only to staff who can edit students (students.edit). */
const canEdit = computed(() => !!view.value?.editable && !!view.value?.canEdit);

type Row = TaughtSubject & { type: string };
const rows = computed<Row[]>(() => {
  const v = view.value;
  if (!v) return [];
  const chosen = new Set(v.chosen.electives);
  return [
    ...v.compulsory.map((s) => ({ ...s, type: 'Compulsory' })),
    ...v.religious
      .filter((s) => s.subjectId === v.chosen.religious)
      .map((s) => ({ ...s, type: 'Religious studies' })),
    ...v.groups.flatMap((g) =>
      g.subjects
        .filter((s) => chosen.has(s.subjectId))
        .map((s) => ({ ...s, type: `${g.name} · ${g.rule}` })),
    ),
  ];
});

const columns: Column[] = [
  { key: 'name', label: 'Subject', width: 'minmax(180px,1.4fr)' },
  { key: 'type', label: 'Type', width: 'minmax(200px,1.4fr)' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'since', label: 'Since', width: '120px' },
];
</script>

<template>
  <Skeleton v-if="isPending" class="h-72" />
  <InlineNotice
    v-else-if="error || !view"
    tone="error"
    title="We couldn’t load the subjects"
    :description="getApiErrorMessage(error, 'Refresh the page to try again.')"
  />
  <EmptyState
    v-else-if="!view.enrolled"
    title="Not in a class this session"
    description="Subjects are added when the student is enrolled into a class arm."
  />
  <div v-else class="flex flex-col gap-3">
    <InlineNotice
      v-if="!view.complete"
      tone="warning"
      title="Subjects need choosing"
      :description="
        canEdit
          ? `${view.name}’s religious subject or electives don’t meet the rules for ${view.className}. Choose them with Change subjects.`
          : `${view.name}’s religious subject or electives don’t meet the rules for ${view.className}.`
      "
    >
      <template v-if="canEdit" #action>
        <Button size="sm" @click="changing = true">Choose subjects</Button>
      </template>
    </InlineNotice>
    <DataTable
      :title="`Subject enrollment · ${view.className} · ${view.session}`"
      description="Compulsory subjects, one religious subject and electives from each group"
      :columns="columns"
      :rows="rows"
      :row-key="(s) => s.subjectId"
      empty-text="No subjects yet. Choose them with Change subjects."
    >
      <template v-if="canEdit" #toolbar>
        <Button size="sm" variant="outline" @click="changing = true">Change subjects</Button>
      </template>
      <template #cell-name="{ row }"
        ><span class="font-medium">{{ row.name }}</span></template
      >
      <template #cell-teacher="{ row }"
        ><span :class="!row.teacher && 'text-warning-strong'">{{
          row.teacher ?? 'No teacher yet'
        }}</span></template
      >
    </DataTable>
    <ChangeSubjectsDrawer
      v-if="canEdit"
      v-model:open="changing"
      :student-id="student.id"
      :view="view"
    />
  </div>
</template>
