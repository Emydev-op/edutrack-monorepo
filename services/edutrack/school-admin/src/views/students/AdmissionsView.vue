<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';

import { useApplicationsQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';

import { tone } from './student-tones';

const context = useContextStore();
const { data, isPending } = useApplicationsQuery();
const search = ref('');
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value ?? []).filter(
    (a) => !q || `${a.applicant} ${a.guardian} ${a.applyingFor}`.toLowerCase().includes(q),
  );
});

const columns: Column[] = [
  { key: 'applicant', label: 'Applicant', width: 'minmax(190px,1.4fr)' },
  { key: 'applyingFor', label: 'Applying for', width: 'minmax(160px,1.2fr)' },
  { key: 'type', label: 'Type', width: '110px' },
  { key: 'applied', label: 'Applied', width: '110px' },
  { key: 'guardian', label: 'Guardian', width: 'minmax(160px,1.2fr)' },
  { key: 'stage', label: 'Stage', width: '170px' },
  { key: 'next', label: '', width: '120px' },
];
</script>

<template>
  <PageHeader
    title="Admissions"
    :description="`${context.current.session} · ${context.current.branch} · Prospective → Application → Admission → Active student`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.import.name }"
          >Import students</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: routesPath.students.admit.name }"
          >Start admission</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(a) => a.id"
    :loading="isPending"
    min-width="1000px"
    empty-text="No applications yet. Start an admission to add a student directly."
  >
    <template #search><SearchInput v-model="search" placeholder="Search applicants" /></template>
    <template #cell-applicant="{ row }">
      <span class="font-medium">{{ row.applicant }}</span>
      <span v-if="row.note" class="text-xs text-faint">{{ row.note }}</span>
    </template>
    <template #cell-stage="{ row }">
      <StatusBadge :label="row.stage" :tone="tone(row.stage)" />
      <span v-if="row.stageNote" class="text-xs text-faint">{{ row.stageNote }}</span>
    </template>
    <template #cell-next="{ row }">
      <RouterLink
        v-if="row.studentId"
        :to="{ name: routesPath.students.detail.name, params: { id: row.studentId } }"
        class="text-[13px] font-medium text-primary hover:underline"
        >View student</RouterLink
      >
      <Button v-else-if="row.stage === 'Offer accepted'" as-child size="sm"
        ><RouterLink :to="{ name: routesPath.students.admit.name, query: { application: row.id } }"
          >Admit</RouterLink
        ></Button
      >
    </template>
  </DataTable>
</template>
