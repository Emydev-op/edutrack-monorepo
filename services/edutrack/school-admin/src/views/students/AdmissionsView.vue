<script setup lang="ts">
import StudentLimitNotice from '@/components/common/StudentLimitNotice.vue';
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useApplicationsQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ApplicationStage } from '@/types';

import { fmtDate, offerExpired } from './application-format';
import { APPLICATION_STAGES, tone } from './student-tones';

const context = useContextStore();
const { data, isPending } = useApplicationsQuery();
const search = ref('');
const stage = useRouteQuery<ApplicationStage | ''>('stage', '');

const all = computed(() => data.value ?? []);
const counts = computed(() => {
  const c: Record<string, number> = { '': all.value.length };
  for (const a of all.value) c[a.stage] = (c[a.stage] ?? 0) + 1;
  return c;
});
const chips: (ApplicationStage | '')[] = ['', ...APPLICATION_STAGES];

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return all.value.filter(
    (a) =>
      (!stage.value || a.stage === stage.value) &&
      (!q || `${a.number} ${a.applicant} ${a.guardian} ${a.applyingFor}`.toLowerCase().includes(q)),
  );
});

const columns: Column[] = [
  { key: 'applicant', label: 'Applicant', width: 'minmax(200px,1.4fr)' },
  { key: 'applyingFor', label: 'Applying for', width: 'minmax(160px,1.2fr)' },
  { key: 'type', label: 'Type', width: '110px' },
  { key: 'applied', label: 'Applied', width: '110px' },
  { key: 'guardian', label: 'Guardian', width: 'minmax(160px,1.2fr)' },
  { key: 'stage', label: 'Stage', width: '180px' },
  { key: 'next', label: '', width: '120px' },
];

const emptyText = computed(() =>
  search.value.trim()
    ? 'No applications match your search.'
    : stage.value
      ? `No applications at the ${stage.value} stage.`
      : 'No applications yet. Record one when a family applies, or start an admission to add a student directly.',
);
</script>

<template>
  <PageHeader
    title="Admissions"
    :description="`${context.current.session} · ${context.current.branch} · Application → Review → Offer → Admission`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.import.name }"
          >Import students</RouterLink
        ></Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.admit.name }"
          >Start admission</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: routesPath.students.applicationNew.name }"
          >New application</RouterLink
        ></Button
      >
    </template>
  </PageHeader>
  <StudentLimitNotice />

  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
    <button
      v-for="s in chips"
      :key="s || 'all'"
      type="button"
      :class="
        cn(
          'rounded-full border px-3 py-1 text-[13px] transition-colors',
          stage === s
            ? 'border-primary bg-accent font-medium text-accent-foreground'
            : 'bg-card hover:border-primary',
        )
      "
      :aria-pressed="stage === s"
      @click="stage = s"
    >
      {{ s || 'All' }}<span class="ml-1 text-faint tabular-nums">{{ counts[s] ?? 0 }}</span>
    </button>
  </div>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(a) => a.id"
    :loading="isPending"
    min-width="1040px"
    :empty-text="emptyText"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search applicants or APP numbers"
    /></template>
    <template #cell-applicant="{ row }">
      <CellLink
        :to="{ name: routesPath.students.application.name, params: { id: row.id } }"
        :label="row.applicant"
        :detail="[row.number, row.note].filter(Boolean).join(' · ')"
      />
    </template>
    <template #cell-stage="{ row }">
      <span class="flex flex-wrap gap-1">
        <StatusBadge :label="row.stage" :tone="tone(row.stage)" />
        <StatusBadge v-if="offerExpired(row)" label="Offer expired" :tone="tone('Offer expired')" />
      </span>
      <span v-if="offerExpired(row)" class="text-xs text-faint"
        >Accept by {{ fmtDate(row.offerExpiresOn) }}</span
      >
      <span v-else-if="row.stageNote" class="text-xs text-faint">{{ row.stageNote }}</span>
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
