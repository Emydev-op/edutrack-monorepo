<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useMyScopeQuery } from '@/api/services/shell';
import { useTeachingStudentsQuery } from '@/api/services/teaching';
import { useTermContext } from '@/composables/useTermContext';
import { formatDay } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import type { TeachingStudentRow } from '@/types';

const { term } = useTermContext();
const { data: scope } = useMyScopeQuery();

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const armId = useRouteQuery<string>('class', '');
const subject = useRouteQuery<string>('subject', '');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

/** FilterMenu works with labels; the URL keeps ids (`?class=mc-jss2b&subject=MTH`). */
const classOptions = computed(() => {
  const seen = new Map<string, string>();
  for (const a of scope.value?.assignments ?? [])
    seen.set(a.armId, scope.value?.multiCampus ? `${a.armName} (${a.branchName})` : a.armName);
  return [...seen.entries()];
});
const subjectOptions = computed(() => [
  ...new Map((scope.value?.assignments ?? []).map((a) => [a.subject, a.subjectName])).entries(),
]);
/** A label model for FilterMenu over an id kept in the URL. */
const labelModel = (options: () => [string, string][], id: { value: string }) =>
  computed({
    get: () => options().find(([k]) => k === id.value)?.[1] ?? '',
    set: (label: string) => (id.value = options().find(([, l]) => l === label)?.[0] ?? ''),
  });
const classLabel = labelModel(() => classOptions.value, armId);
const subjectLabel = labelModel(() => subjectOptions.value, subject);

const { data, isPending, error, refetch } = useTeachingStudentsQuery(() => ({
  class: armId.value || undefined,
  subject: subject.value || undefined,
  q: debounced.value || undefined,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const filtered = computed(() => Boolean(armId.value || subject.value || debounced.value));
const noStudents = computed(() => scope.value && !scope.value.assignments.length);

const columns: Column[] = [
  { key: 'name', label: 'Student', width: 'minmax(190px,1.5fr)' },
  { key: 'admissionNo', label: 'Admission no.', width: 'minmax(130px,1fr)' },
  { key: 'armName', label: 'Class', width: 'minmax(120px,0.9fr)' },
  { key: 'subjects', label: 'My subjects', width: 'minmax(180px,1.5fr)' },
  { key: 'gender', label: 'Gender', width: '80px' },
];
const studentTo = (s: TeachingStudentRow) => ({
  name: routesPath.teaching.student.name,
  params: { studentId: s.id },
});
</script>

<template>
  <PageHeader
    title="Students"
    :description="`Everyone you teach · ${term?.label ?? ''}${data && !filtered ? ` · ${data.meta.total} students` : ''}`"
  />
  <EmptyState
    v-if="error"
    title="Your students couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>
  <EmptyState
    v-else-if="noStudents"
    illustrated
    title="No students yet"
    description="Students appear here once the academic office assigns you classes."
  />
  <DataTable
    v-else
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(s) => s.id"
    :loading="isPending"
    :meta="data?.meta"
    min-width="760px"
    :empty-text="
      filtered ? 'No students match your filters. Try clearing a filter.' : 'No students this term.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search name or admission number"
    /></template>
    <template #filters>
      <FilterMenu v-model="classLabel" label="Class" :options="classOptions.map(([, l]) => l)" />
      <FilterMenu
        v-model="subjectLabel"
        label="Subject"
        :options="subjectOptions.map(([, l]) => l)"
      />
    </template>
    <template #cell-name="{ row }">
      <CellLink
        :to="studentTo(row)"
        :label="row.name"
        :detail="row.joinedLate ? `Joined ${formatDay(row.joinedLate, false)}` : undefined"
      />
    </template>
    <template #cell-armName="{ row }">
      {{ row.armName
      }}<span v-if="scope?.multiCampus" class="text-faint"> · {{ row.branchShort }}</span>
    </template>
    <template #cell-subjects="{ row }">
      <span class="flex flex-wrap gap-1">
        <span
          v-for="s in row.subjects"
          :key="s.code"
          class="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium"
          >{{ s.name }}</span
        >
      </span>
    </template>
  </DataTable>
</template>
