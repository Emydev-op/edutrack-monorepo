<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';

import { useTeachingClassQuery } from '@/api/services/teaching';
import TeachingQueryError from '@/components/teaching/TeachingQueryError.vue';
import { useTermContext } from '@/composables/useTermContext';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import ClassAssessmentsTab from './class/ClassAssessmentsTab.vue';
import ClassAssignmentsTab from './class/ClassAssignmentsTab.vue';
import ClassMaterialsTab from './class/ClassMaterialsTab.vue';
import ClassOverviewTab from './class/ClassOverviewTab.vue';
import ClassResultsTab from './class/ClassResultsTab.vue';
import ClassStudentsTab from './class/ClassStudentsTab.vue';

const route = useRoute();
const layout = useLayoutStore();
const { term } = useTermContext();
const armId = computed(() => String(route.params.armId));
const subject = computed(() => String(route.params.subject));
const { data, isPending, error, refetch } = useTeachingClassQuery(armId, subject);
const c = computed(() => data.value?.class ?? null);
watch(c, (x) => layout.setRecordLabel(x ? `${x.armName} · ${x.subjectName}` : null), {
  immediate: true,
});

const TABS = [
  'overview',
  'students',
  'assignments',
  'assessments',
  'results',
  'materials',
] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>(() => {
  const q = String(route.query.tab ?? 'overview') as Tab;
  return TABS.includes(q) ? q : 'overview';
});
const tabs = computed(() =>
  TABS.map((t) => ({
    label: t[0]!.toUpperCase() + t.slice(1),
    to: { query: { ...route.query, tab: t === 'overview' ? undefined : t } },
    active: tab.value === t,
    count: t === 'students' ? c.value?.students : undefined,
  })),
);

const label = computed(() => `${armId.value.toUpperCase()} · ${subject.value}`);
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-64" /></template>
  <TeachingQueryError
    v-else-if="error || !data || !c"
    :error="error"
    :what="label"
    not-found-title="This class wasn’t found"
    :back="{ label: 'My classes', to: { name: routesPath.teaching.classes.name } }"
    @retry="refetch()"
  />
  <template v-else>
    <PageHeader
      :title="`${c.armName} · ${c.subjectName}`"
      :description="`${c.branchName} · ${term?.label ?? ''}`"
      :meta="[
        { label: 'Students', value: String(c.students) },
        { label: 'Periods a week', value: String(c.periodsPerWeek) },
        { label: 'Role', value: c.isClassTeacher ? `${c.role} · Class teacher` : c.role },
      ]"
    />
    <TabNav :tabs="tabs" label="Class" />
    <ClassOverviewTab v-if="tab === 'overview'" :detail="data" />
    <ClassStudentsTab v-else-if="tab === 'students'" :detail="data" />
    <ClassAssignmentsTab v-else-if="tab === 'assignments'" :key="`a-${c.id}`" :detail="data" />
    <ClassAssessmentsTab v-else-if="tab === 'assessments'" :detail="data" />
    <ClassResultsTab v-else-if="tab === 'results'" :detail="data" />
    <ClassMaterialsTab v-else-if="tab === 'materials'" :key="`m-${c.id}`" :detail="data" />
  </template>
</template>
