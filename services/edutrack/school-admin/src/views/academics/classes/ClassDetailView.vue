<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';

import { useClassQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const context = useContextStore();
const id = computed(() => String(route.params.id));
const { data: detail, isPending, isError } = useClassQuery(id);
watch(detail, (d) => layout.setRecordLabel(d?.arm.name ?? null), { immediate: true });

const a = routesPath.academics;
const tabs = computed(() =>
  (
    [
      ['Overview', a.classDetail.name],
      ['Students', a.classStudents.name],
      ['Subjects & teachers', a.classSubjects.name],
      ['Timetable', a.classTimetable.name],
      ['Results', a.classResults.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);
const status = computed(() => {
  const arm = detail.value?.arm;
  if (!arm) return 'Active';
  return arm.students >= arm.capacity ? 'Full' : 'Active';
});
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !detail"
    illustrated
    title="This class doesn’t exist"
    description="It may have been removed, or the link belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: a.classes.name }">Classes & Arms</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="detail.arm.name"
      :status="status"
      :description="`${detail.arm.section} · ${detail.arm.branch} · ${context.current.session}`"
      :meta="[
        { label: 'Class teacher', value: detail.arm.classTeacher ?? 'Not assigned' },
        { label: 'Students', value: `${detail.arm.students} of ${detail.arm.capacity}` },
      ]"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: a.timetable.name, query: { arm: detail.arm.id } }"
            >Timetable</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink :to="{ name: a.results.name, query: { section: detail.arm.section } }"
            >Results</RouterLink
          ></Button
        >
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="Class record" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :detail="detail" />
    </RouterView>
  </template>
</template>
