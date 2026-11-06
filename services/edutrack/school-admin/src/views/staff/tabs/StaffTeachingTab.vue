<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { routesPath } from '@/router/routes-path';
import type { StaffDetail } from '@/types';

const props = defineProps<{ staff: StaffDetail }>();
const t = computed(() => props.staff.teaching);
const load = computed(() => props.staff.load);
const branches = computed(() => [...new Set(t.value?.assignments.map((a) => a.branch) ?? [])]);
const over = computed(() => !!load.value && load.value.periods > load.value.max);
const near = computed(
  () => !!load.value && !over.value && load.value.periods >= load.value.max - 2,
);

const columns: Column[] = [
  { key: 'subjectName', label: 'Subject', width: 'minmax(180px,1.4fr)' },
  { key: 'arm', label: 'Class' },
  { key: 'branch', label: 'Branch' },
  { key: 'type', label: 'Type' },
  { key: 'periods', label: 'Periods / wk', align: 'right', width: '110px' },
];
const assignTo = { name: routesPath.academics.assignments.name };
const classTo = (armId: string) => ({
  name: routesPath.academics.classDetail.name,
  params: { id: armId },
});
</script>

<template>
  <template v-if="t && load">
    <InlineNotice
      v-if="over"
      tone="error"
      title="Over the weekly limit"
      :description="`${load.periods} of ${load.max} periods. Move some lessons to another teacher in Teacher Assignments.`"
    />
    <InlineNotice
      v-if="branches.length > 1"
      tone="info"
      :title="`Teaches at ${branches.length} branches`"
      :description="`${branches.join(' and ')}. Timetable conflicts are checked across both campuses.`"
    />

    <SectionCard :title="`Workload · ${t.term}`">
      <div class="flex flex-col gap-3">
        <MeterRow
          label="Periods per week"
          label-width="130px"
          value-width="110px"
          :percent="load.max ? (load.periods / load.max) * 100 : 0"
          :value="`${load.periods} of ${load.max}`"
          :color="over ? 'var(--error)' : near ? 'var(--warning)' : 'var(--success)'"
        />
        <div class="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span class="text-faint">Qualified to teach</span>
          <span
            v-for="q in staff.qualifiedNames"
            :key="q"
            class="rounded-sm border bg-muted px-2 py-0.5 text-xs"
            >{{ q }}</span
          >
          <span v-if="!staff.qualifiedNames.length" class="text-muted-foreground"
            >None listed · add subjects from Edit</span
          >
        </div>
        <p v-if="t.classTeacherOf.length" class="text-[13px]">
          <span class="text-faint">Class teacher of</span>
          <template v-for="(c, i) in t.classTeacherOf" :key="c.id">
            {{ i ? ', ' : ' '
            }}<RouterLink :to="classTo(c.id)" class="text-primary hover:underline">{{
              c.name
            }}</RouterLink>
          </template>
        </p>
      </div>
    </SectionCard>

    <DataTable
      v-if="t.assignments.length"
      :title="`Teacher assignments · ${t.term}`"
      :columns="columns"
      :rows="t.assignments"
      :row-key="(a) => a.id"
    >
      <template #toolbar>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="assignTo">Teacher Assignments</RouterLink></Button
        >
      </template>
      <template #cell-arm="{ row }"
        ><CellLink :to="classTo(row.armId)" :label="row.arm"
      /></template>
    </DataTable>
    <EmptyState
      v-else
      title="No classes assigned"
      :description="`${staff.name} isn’t teaching any subject this term. They’ll see an empty Teacher Workspace until you assign them.`"
    >
      <Button as-child variant="outline"
        ><RouterLink :to="assignTo">Go to Teacher Assignments</RouterLink></Button
      >
    </EmptyState>
  </template>
  <EmptyState
    v-else
    title="Not teaching staff"
    description="Change their staff type to Teaching from Edit to assign them classes."
  />
</template>
