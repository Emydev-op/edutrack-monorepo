<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { DownloadIcon, EyeIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import { useAuditActorsQuery, useAuditQuery } from '@/api/services/activity';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { routesPath } from '@/router/routes-path';
import type { ActivityQuery, AuditEntry } from '@/types';

import { AUDIT_ENTITIES } from '../activity/activity-filters';
import AuditEntryDrawer from './AuditEntryDrawer.vue';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
const actor = ref('');
const entity = ref('');
const date = ref<DateRangeValue>({});
watch([debouncedSearch, actor, entity, date], () => (page.value = '1'));

const { data: actors } = useAuditActorsQuery();
const { data, isPending } = useAuditQuery(() => ({
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
  actor: actor.value || undefined,
  entity: (entity.value || undefined) as ActivityQuery['entity'],
  dateFrom: date.value.from,
  dateTo: date.value.to,
}));
const entryId = computed(() => (route.params.entryId as string | undefined) || undefined);
const openEntry = (id?: string) =>
  router.replace({ name: routesPath.audit.name, params: { entryId: id }, query: route.query });

const columns: Column[] = [
  { key: 'timestamp', label: 'Timestamp (WAT)', width: '160px' },
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action', width: 'minmax(180px,1.4fr)' },
  { key: 'entity', label: 'Entity', width: '130px' },
  { key: 'entityId', label: 'Entity ID', width: '100px' },
  { key: 'previousValue', label: 'Previous', width: 'minmax(110px,1fr)' },
  { key: 'newValue', label: 'New', width: 'minmax(140px,1.2fr)' },
  { key: 'ipDevice', label: 'IP · device', width: 'minmax(150px,1.2fr)' },
];
const actions = (entry: AuditEntry): RowAction[] => [
  { label: 'View entry', icon: EyeIcon, onSelect: () => openEntry(entry.id) },
];

function exportCsv() {
  const rows = data.value?.data ?? [];
  void confirm({
    title: 'Export the audit log?',
    details: [
      ['Rows', `${rows.length} entries matching the current filters`],
      ['Format', 'CSV · UTF-8'],
      ['Contains', 'IP addresses and user emails. Treat the file as confidential.'],
      ['Logged', 'The export itself is recorded in the audit log'],
    ],
    confirmLabel: 'Export CSV',
    action: () => {
      downloadCsv(
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Timestamp',
          'Actor',
          'Action',
          'Entity',
          'Entity ID',
          'Previous',
          'New',
          'IP · device',
          'Request ID',
        ],
        rows.map((e) => [
          e.timestamp,
          e.actor,
          e.action,
          e.entity,
          e.entityId,
          e.previousValue,
          e.newValue,
          e.ipDevice,
          e.requestId,
        ]),
      );
      toast.success(`Exported ${rows.length} audit entries.`);
    },
  });
}
</script>

<template>
  <PageHeader
    title="Audit log"
    description="Security and compliance record. Every privileged action with before and after values. Read-only and kept for 7 years."
  />
  <DataTable
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(e) => e.id"
    :row-label="(e) => e.action"
    :actions="actions"
    :loading="isPending"
    :meta="data?.meta"
    min-width="1180px"
    empty-text="No audit entries match your filters. Widen the date range or clear the actor and entity filters."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search actor, action or entity ID"
    /></template>
    <template #filters>
      <FilterMenu v-model="actor" label="Actor" :options="actors ?? []" />
      <FilterMenu v-model="entity" label="Entity" :options="AUDIT_ENTITIES" />
      <DateRangeFilter v-model="date" label="Date range" />
    </template>
    <template #toolbar>
      <Button variant="outline" class="h-9" :disabled="!data?.data.length" @click="exportCsv"
        ><DownloadIcon />Export CSV</Button
      >
    </template>
    <template #cell-action="{ row }">
      <button
        type="button"
        class="text-left font-medium text-primary hover:underline"
        @click="openEntry(row.id)"
      >
        {{ row.action }}
      </button>
    </template>
    <template #cell-entity="{ row }"
      ><StatusBadge :label="row.entity" tone="neutral" :dot="false"
    /></template>
    <template #cell-entityId="{ row }"
      ><span class="text-muted-foreground">{{ row.entityId }}</span></template
    >
    <template #cell-previousValue="{ row }"
      ><span class="text-muted-foreground">{{ row.previousValue }}</span></template
    >
    <template #cell-ipDevice="{ row }"
      ><span class="text-faint">{{ row.ipDevice }}</span></template
    >
  </DataTable>
  <AuditEntryDrawer :entry-id="entryId" @close="openEntry(undefined)" />
</template>
