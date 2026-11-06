<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { initials } from '@edutrack/app-kit/lib/format';

import { useStudentQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const context = useContextStore();
const id = computed(() => String(route.params.id));
const { data: student, isPending, isError } = useStudentQuery(id);
watch(student, (s) => layout.setRecordLabel(s?.name ?? null), { immediate: true });

const s = routesPath.students;
const tabs = computed(() =>
  (
    [
      ['Overview', s.detail.name],
      ['Academics', s.academics.name],
      ['Subjects', s.subjects.name],
      ['Fees', s.fees.name],
      ['Parents', s.guardians.name],
      ['Documents', s.documents.name],
      ['Activity', s.activity.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name, params: { id: id.value } },
    active: route.name === name,
  })),
);
const enrolled = computed(
  () => !!student.value && ['Active', 'Incomplete profile'].includes(student.value.status),
);
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !student"
    illustrated
    title="This student doesn’t exist"
    description="The link may be wrong, or the record belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: s.list.name }">All students</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="student.name"
      :initials="initials(student.name)"
      :status="student.status"
      :description="`${student.admissionNo} · ${student.gender}${student.age ? ` · ${student.age} years` : ''}`"
      :meta="[
        { label: 'Session', value: context.current.session },
        { label: 'Class', value: student.className || 'Awaiting arm' },
        { label: 'Branch', value: student.branch },
      ]"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.communication.announcements.name }"
            >Message guardian</RouterLink
          ></Button
        >
        <Button v-if="enrolled" as-child variant="outline"
          ><RouterLink :to="{ name: s.transfer.name, params: { id: student.id } }"
            >Transfer / withdraw</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink :to="{ name: routesPath.finance.payments.name }"
            >Record payment</RouterLink
          ></Button
        >
      </template>
    </PageHeader>
    <TabNav :tabs="tabs" label="Student record" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :student="student" />
    </RouterView>
  </template>
</template>
