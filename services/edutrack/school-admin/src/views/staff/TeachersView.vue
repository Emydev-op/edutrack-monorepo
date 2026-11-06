<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { EyeIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useTeachersQuery } from '@/api/services/staff';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { TeacherRow } from '@/types';
import { accountTone } from '@/views/school/users/user-tones';

type Show = 'all' | 'unassigned' | 'near';

const context = useContextStore();
const { data, isPending } = useTeachersQuery();

const show = useRouteQuery<Show>('show', 'all');
const search = ref('');
const debounced = refDebounced(search, 250);

const teachers = computed(() => data.value ?? []);
const unassigned = (t: TeacherRow) => !t.subjects.length && !t.classTeacherOf.length;
const near = (t: TeacherRow) => t.periods >= t.max - 2;

const rows = computed(() => {
  const q = debounced.value.trim().toLowerCase();
  return teachers.value.filter(
    (t) =>
      (show.value === 'all' ||
        (show.value === 'unassigned' ? unassigned(t) : near(t) && !unassigned(t))) &&
      (!q ||
        `${t.name} ${t.staffNumber} ${t.qualified.join(' ')} ${t.subjects.map((s) => s.name).join(' ')}`
          .toLowerCase()
          .includes(q)),
  );
});

const stats = computed(() => ({
  total: teachers.value.length,
  over: teachers.value.filter((t) => t.periods > t.max).length,
  near: teachers.value.filter((t) => near(t) && t.periods <= t.max).length,
  unassigned: teachers.value.filter(unassigned).length,
  classTeachers: teachers.value.filter((t) => t.classTeacherOf.length).length,
}));

const teachingLink = (t: TeacherRow) => ({
  name: routesPath.staff.teaching.name,
  params: { id: t.id },
});
const actions = (t: TeacherRow): RowAction[] => [
  { label: 'View teaching', icon: EyeIcon, to: teachingLink(t) },
];

const loadTone = (t: TeacherRow) =>
  t.periods > t.max
    ? { bar: 'bg-error', text: 'text-error-strong' }
    : t.periods >= t.max - 2
      ? { bar: 'bg-warning', text: 'text-warning-strong' }
      : { bar: 'bg-success', text: 'text-body' };

const CHIPS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned only' },
  { value: 'near', label: 'Near or over limit' },
];

const columns: Column[] = [
  { key: 'name', label: 'Teacher', width: 'minmax(190px,1.4fr)' },
  { key: 'branch', label: 'Branch', width: 'minmax(120px,1fr)' },
  { key: 'qualified', label: 'Qualified', width: 'minmax(110px,0.9fr)' },
  { key: 'subjects', label: 'Teaching', width: 'minmax(220px,1.8fr)' },
  { key: 'classTeacherOf', label: 'Class teacher', width: 'minmax(110px,0.8fr)' },
  { key: 'load', label: 'Workload', width: 'minmax(170px,1.2fr)' },
  { key: 'account', label: 'System access', width: '130px' },
];
</script>

<template>
  <PageHeader
    title="Teachers"
    :description="`${teachers.length} teaching staff · workload ${context.current.session} · ${context.current.term}`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.assignments.name }"
          >Teacher Assignments</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: routesPath.staff.new.name, query: { kind: 'Teaching' } }"
          >Add teacher</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <EmptyState
    v-if="!isPending && !teachers.length"
    illustrated
    title="No teaching staff yet"
    description="Add teachers so you can assign them to subjects and classes. They’ll see their classes in the Teacher Workspace."
  >
    <Button as-child
      ><RouterLink :to="{ name: routesPath.staff.new.name, query: { kind: 'Teaching' } }"
        >Add teacher</RouterLink
      ></Button
    >
  </EmptyState>

  <template v-else>
    <MetricGrid>
      <MetricCard label="Teachers" :value="stats.total" :loading="isPending" />
      <MetricCard
        label="Near or over limit"
        :value="stats.near + stats.over"
        :hint="stats.over ? `${stats.over} over their maximum` : 'None over their maximum'"
        :hint-tone="stats.over ? 'error' : stats.near ? 'warning' : 'success'"
        :loading="isPending"
      />
      <MetricCard
        label="Unassigned"
        :value="stats.unassigned"
        :hint="stats.unassigned ? 'They see an empty Teacher Workspace' : 'Everyone has classes'"
        :hint-tone="stats.unassigned ? 'warning' : 'success'"
        :to="stats.unassigned ? { query: { show: 'unassigned' } } : undefined"
        :loading="isPending"
      />
      <MetricCard label="Class teachers" :value="stats.classTeachers" :loading="isPending" />
    </MetricGrid>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(t) => t.id"
      :row-label="(t) => t.name"
      :actions="actions"
      :loading="isPending"
      min-width="1100px"
      empty-text="No teachers match. Clear the search or show all."
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Name, staff ID or subject"
      /></template>
      <template #filters>
        <div class="flex gap-1.5" role="group" aria-label="Show">
          <button
            v-for="c in CHIPS"
            :key="c.value"
            type="button"
            :aria-pressed="show === c.value"
            :class="
              cn(
                'h-9 rounded-md border px-3 text-[13px]',
                show === c.value
                  ? 'border-primary bg-brand-tint font-medium text-brand-strong'
                  : 'bg-card text-body hover:bg-muted',
              )
            "
            @click="show = c.value"
          >
            {{ c.label }}
          </button>
        </div>
      </template>
      <template #cell-name="{ row }">
        <CellLink :to="teachingLink(row)" :label="row.name" />
        <span class="text-xs text-faint">{{ row.staffNumber }} · {{ row.employment }}</span>
      </template>
      <template #cell-qualified="{ row }">
        <span v-if="row.qualified.length" class="text-[13px]">{{ row.qualified.join(', ') }}</span>
        <span v-else class="text-faint">None listed</span>
      </template>
      <template #cell-subjects="{ row }">
        <span v-if="!row.subjects.length" class="text-warning-strong">Not assigned</span>
        <span v-else class="flex flex-col gap-0.5 text-[13px]">
          <span v-for="s in row.subjects" :key="s.code"
            ><span class="font-medium">{{ s.name }}</span>
            <span class="text-muted-foreground"> · {{ s.arms.join(', ') }}</span></span
          >
        </span>
      </template>
      <template #cell-classTeacherOf="{ row }">
        <span v-if="row.classTeacherOf.length">{{ row.classTeacherOf.join(', ') }}</span>
        <span v-else class="text-faint">—</span>
      </template>
      <template #cell-load="{ row }">
        <span class="flex flex-col gap-1">
          <span class="text-[13px] tabular-nums" :class="loadTone(row).text"
            >{{ row.periods }} of {{ row.max }} periods</span
          >
          <span class="h-1.5 overflow-hidden rounded-full bg-divider">
            <span
              class="block h-full rounded-full"
              :class="loadTone(row).bar"
              :style="{ width: `${Math.min(100, (row.periods / Math.max(1, row.max)) * 100)}%` }"
            />
          </span>
        </span>
      </template>
      <template #cell-account="{ row }"
        ><StatusBadge :label="row.account" :tone="accountTone(row.account)"
      /></template>
    </DataTable>
  </template>
</template>
