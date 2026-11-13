<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useTeachingSubjectQuery } from '@/api/services/teaching';
import TeachingQueryError from '@/components/teaching/TeachingQueryError.vue';
import { useTermContext } from '@/composables/useTermContext';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { SubjectClass } from '@/types';

const route = useRoute();
const layout = useLayoutStore();
const { term } = useTermContext();
const code = computed(() => String(route.params.subject));
const { data, isPending, error, refetch } = useTeachingSubjectQuery(code);
const s = computed(() => data.value?.subject ?? null);
watch(s, (x) => layout.setRecordLabel(x?.name ?? null), { immediate: true });

const columns = computed<Column[]>(() => [
  { key: 'armName', label: 'Class', width: 'minmax(150px,1.4fr)' },
  ...(data.value?.multiCampus ? [{ key: 'branchName', label: 'Campus', width: '130px' }] : []),
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'periodsPerWeek', label: 'Periods / week', align: 'right', width: '120px' },
  { key: 'role', label: 'My role', width: 'minmax(120px,1fr)' },
]);
const classTo = (c: SubjectClass) => ({
  name: routesPath.teaching.class.name,
  params: { armId: c.armId, subject: code.value },
});
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-64" /></template>
  <TeachingQueryError
    v-else-if="error || !data || !s"
    :error="error"
    :what="code"
    not-found-title="This subject wasn’t found"
    :back="{ label: 'My subjects', to: { name: routesPath.teaching.subjects.name } }"
    @retry="refetch()"
  />
  <template v-else>
    <PageHeader
      :title="s.name"
      :description="`${s.department.name} · ${term?.label ?? ''}`"
      :meta="[
        { label: 'Classes', value: String(s.classes.length) },
        { label: 'Students', value: String(s.students) },
        { label: 'Periods a week', value: String(s.periodsPerWeek) },
      ]"
    />
    <DataTable :columns="columns" :rows="s.classes" :row-key="(c) => c.armId" title="Classes">
      <template #cell-armName="{ row }"
        ><CellLink :to="classTo(row)" :label="row.armName"
      /></template>
    </DataTable>
    <div class="grid gap-4 md:grid-cols-2">
      <KeyValueCard
        title="Department"
        :rows="[
          { label: 'Department', value: s.department.name },
          { label: 'HOD', value: s.department.hod ?? 'No HOD' },
          {
            label: 'Result sheets go to',
            value: s.department.hod
              ? `${s.department.hod}, then the academic office`
              : 'The academic office',
          },
        ]"
      />
      <SectionCard
        v-for="scheme in data.schemes"
        :key="scheme.section"
        :title="`Assessment scheme · ${scheme.section}`"
        :description="`Set by the school · grades ${scheme.scaleName} · read-only`"
      >
        <table class="w-full text-[13px]">
          <thead>
            <tr class="text-left text-xs text-faint">
              <th class="pb-1.5 font-normal">Component</th>
              <th class="pb-1.5 text-right font-normal">Max</th>
              <th class="pb-1.5 text-right font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="comp in scheme.components" :key="comp.key" class="border-t border-divider">
              <td class="py-1.5">{{ comp.name }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ comp.max }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ comp.weight }}%</td>
            </tr>
          </tbody>
        </table>
      </SectionCard>
    </div>
  </template>
</template>
