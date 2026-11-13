<script setup lang="ts">
import { computed, ref } from 'vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';

import { formatDay } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import type { ClassStudentRow, TeachingClassDetail } from '@/types';

const props = defineProps<{ detail: TeachingClassDetail }>();
const search = ref('');
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.detail.students.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q),
  );
});
const columns: Column[] = [
  { key: 'name', label: 'Student', width: 'minmax(200px,1.6fr)' },
  { key: 'admissionNo', label: 'Admission no.', width: 'minmax(130px,1fr)' },
  { key: 'gender', label: 'Gender', width: '80px' },
  { key: 'note', label: 'Note', width: 'minmax(110px,1fr)' },
];
const studentTo = (s: ClassStudentRow) => ({
  name: routesPath.teaching.student.name,
  params: { studentId: s.id },
});
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(s) => s.id"
    :title="`${detail.class.students} students`"
    :description="`Students in ${detail.class.armName} taking ${detail.class.subjectName}`"
    :empty-text="
      search ? 'No students match your search.' : 'No students take this subject in this class.'
    "
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search name or admission number"
    /></template>
    <template #cell-name="{ row }"><CellLink :to="studentTo(row)" :label="row.name" /></template>
    <template #cell-note="{ row }">
      <span v-if="row.joinedLate" class="text-xs text-info-strong"
        >Joined {{ formatDay(row.joinedLate, false) }}</span
      >
      <span v-else class="text-faint">—</span>
    </template>
  </DataTable>
</template>
