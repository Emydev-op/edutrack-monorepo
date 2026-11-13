<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { refDebounced } from '@vueuse/core';
import { PlusIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useMyScopeQuery } from '@/api/services/shell';
import AssignmentsTable from '@/components/assignments/AssignmentsTable.vue';
import ClassSubjectFilter from '@/components/assignments/ClassSubjectFilter.vue';
import { useTermContext } from '@/composables/useTermContext';
import { routesPath } from '@/router/routes-path';
import type { AssignmentList } from '@/types';

const route = useRoute();
const router = useRouter();
const { isReadOnly, readOnlyReason, term } = useTermContext();
const { data: scope } = useMyScopeQuery();

const armId = useRouteQuery<string>('class', '');
const subject = useRouteQuery<string>('subject', '');
const status = useRouteQuery<string>('status', '');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const debounced = refDebounced(search, 300);
watch(debounced, (q) => {
  void router.replace({ query: { ...route.query, q: q || undefined, page: undefined } });
});

function setClass(v: { armId: string; subject: string }) {
  void router.replace({
    query: {
      ...route.query,
      class: v.armId || undefined,
      subject: v.subject || undefined,
      page: undefined,
    },
  });
}

const list = ref<AssignmentList | null>(null);
const tabs = computed(() =>
  (
    [
      ['', 'All'],
      ['Published', 'Published'],
      ['To grade', 'To grade'],
      ['Draft', 'Drafts'],
      ['Closed', 'Closed'],
    ] as const
  ).map(([key, label]) => ({
    label,
    to: { query: { ...route.query, status: key || undefined, page: undefined } },
    active: status.value === key,
    count:
      key === 'To grade'
        ? list.value?.counts.toGrade
        : key === 'Draft'
          ? list.value?.counts.Draft
          : undefined,
  })),
);

const newLink = computed(() => ({
  name: routesPath.assignments.new.name,
  query: { class: armId.value || undefined, subject: subject.value || undefined },
}));
const noClasses = computed(() => scope.value && !scope.value.assignments.length);
</script>

<template>
  <PageHeader
    title="Assignments"
    :description="`Work you’ve set for your classes in ${term?.label ?? 'this term'}, and what’s waiting to be graded.`"
  >
    <template #actions>
      <Button v-if="!isReadOnly && !noClasses" as-child>
        <RouterLink :to="newLink"><PlusIcon class="size-4" /> New assignment</RouterLink>
      </Button>
      <Button v-else-if="!noClasses" disabled :title="readOnlyReason ?? undefined">
        <PlusIcon class="size-4" /> New assignment
      </Button>
    </template>
  </PageHeader>

  <p v-if="isReadOnly && readOnlyReason" class="text-[13px] text-muted-foreground">
    {{ readOnlyReason }}
  </p>

  <EmptyState
    v-if="noClasses"
    illustrated
    title="No classes to set work for yet"
    description="The academic office assigns your classes. Once they do, you can create assignments here."
  />
  <template v-else>
    <TabNav :tabs="tabs" label="Assignment status" />
    <AssignmentsTable
      :arm-id="armId || undefined"
      :subject="subject || undefined"
      :status="status || undefined"
      :search="debounced || undefined"
      :page="Number(page) || 1"
      :page-size="Number(pageSize) || 10"
      @update:page="page = String($event)"
      @update:page-size="pageSize = String($event)"
      @loaded="list = $event"
    >
      <template #search>
        <SearchInput v-model="search" placeholder="Search by title or class" />
      </template>
      <template #filters>
        <ClassSubjectFilter :arm-id="armId" :subject="subject" @change="setClass" />
      </template>
    </AssignmentsTable>
  </template>
</template>
