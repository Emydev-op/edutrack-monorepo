<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { useActivityQuery, useAuditActorsQuery } from '@/api/services/activity';
import { useSchoolsQuery } from '@/api/services/schools';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { routesPath } from '@/router/routes-path';
import type { ActivityQuery } from '@/types';

import { ACTIVITY_ENTITIES } from './activity-filters';

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
const actor = ref('');
const entity = ref('');
const schoolName = ref('');
const date = ref<DateRangeValue>({});
watch([debouncedSearch, actor, entity, schoolName, date], () => (page.value = '1'));

const { data: schools } = useSchoolsQuery({ pageSize: 100 });
const schoolNames = computed(() => (schools.value?.data ?? []).map((s) => s.name));
const { data: actors } = useAuditActorsQuery();
const { data, isPending } = useActivityQuery(() => ({
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
  actor: actor.value || undefined,
  entity: (entity.value || undefined) as ActivityQuery['entity'],
  schoolName: schoolName.value || undefined,
  dateFrom: date.value.from,
  dateTo: date.value.to,
}));

const columns: Column[] = [
  { key: 'when', label: 'When', width: '110px' },
  { key: 'summary', label: 'What happened', width: 'minmax(260px,2.2fr)' },
  { key: 'actor', label: 'Who' },
  { key: 'schoolName', label: 'School', width: 'minmax(160px,1.3fr)' },
  { key: 'entity', label: 'Entity', width: '130px' },
];
</script>

<template>
  <PageHeader
    title="Activity"
    description="What has been happening across the platform, in plain language. For compliance detail, see Audit."
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.audit.name }">Open audit log</RouterLink></Button
      >
    </template>
  </PageHeader>
  <DataTable
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(a) => a.id"
    :loading="isPending"
    :meta="data?.meta"
    min-width="960px"
    empty-text="No activity matches these filters."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search><SearchInput v-model="search" placeholder="Search activity" /></template>
    <template #filters>
      <FilterMenu v-model="actor" label="Actor" :options="actors ?? []" />
      <FilterMenu v-model="entity" label="Entity" :options="ACTIVITY_ENTITIES" />
      <FilterMenu v-model="schoolName" label="School" :options="schoolNames" />
      <DateRangeFilter v-model="date" label="Date range" />
    </template>
    <template #cell-summary="{ row }"
      ><span class="font-medium">{{ row.summary }}</span></template
    >
    <template #cell-entity="{ row }"
      ><StatusBadge :label="row.entity" tone="neutral" :dot="false"
    /></template>
  </DataTable>
</template>
