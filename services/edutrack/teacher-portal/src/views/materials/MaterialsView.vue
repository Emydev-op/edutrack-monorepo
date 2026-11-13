<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { refDebounced } from '@vueuse/core';
import { UploadIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useMyScopeQuery } from '@/api/services/shell';
import ClassSubjectFilter from '@/components/assignments/ClassSubjectFilter.vue';
import MaterialsTable from '@/components/materials/MaterialsTable.vue';
import { useTermContext } from '@/composables/useTermContext';
import { routesPath as r } from '@/router/routes-path';
import { MATERIAL_TYPES, type MaterialList } from '@/types';

const route = useRoute();
const router = useRouter();
const { isReadOnly, readOnlyReason, term } = useTermContext();
const { data: scope } = useMyScopeQuery();

const armId = useRouteQuery<string>('class', '');
const subject = useRouteQuery<string>('subject', '');
const type = useRouteQuery<string>('type', '');
const status = useRouteQuery<string>('status', 'Published');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const debounced = refDebounced(search, 300);
watch(debounced, (q) =>
  router.replace({ query: { ...route.query, q: q || undefined, page: undefined } }),
);
const setClass = (v: { armId: string; subject: string }) =>
  router.replace({
    query: {
      ...route.query,
      class: v.armId || undefined,
      subject: v.subject || undefined,
      page: undefined,
    },
  });

const list = ref<MaterialList | null>(null);
const tabs = computed(() =>
  (
    [
      ['Published', 'Published'],
      ['Archived', 'Archived'],
      ['all', 'All'],
    ] as const
  ).map(([key, label]) => ({
    label,
    to: {
      query: { ...route.query, status: key === 'Published' ? undefined : key, page: undefined },
    },
    active: status.value === key,
    count: key === 'all' ? undefined : list.value?.counts[key],
  })),
);
const uploadTo = computed(() => ({
  name: r.materials.upload.name,
  query: { class: armId.value || undefined, subject: subject.value || undefined },
}));
const noClasses = computed(() => scope.value && !scope.value.assignments.length);
</script>

<template>
  <PageHeader
    title="Materials"
    :description="`Notes, slides and videos you’ve shared with your classes in ${term?.label ?? 'this term'}.`"
  >
    <template #actions>
      <Button v-if="!isReadOnly && !noClasses" as-child>
        <RouterLink :to="uploadTo"><UploadIcon class="size-4" /> Upload material</RouterLink>
      </Button>
      <Button v-else-if="!noClasses" disabled :title="readOnlyReason ?? undefined">
        <UploadIcon class="size-4" /> Upload material
      </Button>
    </template>
  </PageHeader>
  <p v-if="isReadOnly && readOnlyReason" class="text-[13px] text-muted-foreground">
    {{ readOnlyReason }}
  </p>
  <EmptyState
    v-if="noClasses"
    illustrated
    title="No classes to share materials with yet"
    description="The academic office assigns your classes. Once they do, you can upload materials here."
  />
  <template v-else>
    <TabNav :tabs="tabs" label="Material status" />
    <MaterialsTable
      :arm-id="armId || undefined"
      :subject="subject || undefined"
      :type="type || undefined"
      :status="status === 'all' ? undefined : status"
      :search="debounced || undefined"
      :page="Number(page) || 1"
      :page-size="Number(pageSize) || 10"
      @update:page="page = String($event)"
      @update:page-size="pageSize = String($event)"
      @loaded="list = $event"
    >
      <template #search><SearchInput v-model="search" placeholder="Search materials" /></template>
      <template #filters>
        <ClassSubjectFilter :arm-id="armId" :subject="subject" @change="setClass" />
        <FilterMenu v-model="type" label="Type" :options="MATERIAL_TYPES" />
      </template>
    </MaterialsTable>
  </template>
</template>
