<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useTicketsQuery } from '@/api/services/support';
import { routesPath } from '@/router/routes-path';
import type { TicketTab } from '@/types';

import { fmtWhen, SLA_TONE, TICKET_TONE } from './support-format';

const tab = useRouteQuery<TicketTab>('tab', 'open');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

const safeTab = computed<TicketTab>(() =>
  (['open', 'closed', 'all'] as const).includes(tab.value) ? tab.value : 'open',
);

const { data, isPending, isError, refetch } = useTicketsQuery(() => ({
  tab: safeTab.value,
  search: debounced.value || undefined,
  page: Number(page.value) || 1,
  pageSize: Number(pageSize.value) || 20,
}));

const tabs = computed(() =>
  (
    [
      ['open', 'Open'],
      ['closed', 'Resolved & closed'],
      ['all', 'All'],
    ] as const
  ).map(([key, label]) => ({
    label,
    to: { query: { tab: key === 'open' ? undefined : key } },
    active: safeTab.value === key,
    count: data.value?.counts[key],
  })),
);

const columns: Column[] = [
  { key: 'subject', label: 'Ticket', width: 'minmax(240px,2fr)' },
  { key: 'category', label: 'Category', width: 'minmax(150px,1fr)' },
  { key: 'priority', label: 'Priority', width: '90px' },
  { key: 'handler', label: 'Handled by', width: 'minmax(150px,1fr)' },
  { key: 'updated', label: 'Updated', width: '120px' },
  { key: 'status', label: 'Status', width: 'minmax(170px,1fr)' },
];

const attention = computed(() => data.value?.attention ?? []);
const attentionTitle = computed(() => {
  const n = attention.value.length;
  return `${n} ticket${n === 1 ? ' needs' : 's need'} your reply or confirmation`;
});

const emptyText = computed(() => {
  if (debounced.value) return 'No tickets match your search.';
  if (safeTab.value === 'open')
    return 'No open tickets. If something isn’t working, create one and we’ll pick it up.';
  if (safeTab.value === 'closed') return 'No resolved or closed tickets yet.';
  return 'No tickets yet. Create one whenever you need help from the EduTrack team.';
});
</script>

<template>
  <PageHeader
    title="Support"
    description="Get help from the EduTrack platform team. Typical first reply within 4 working hours (Mon–Fri, 8:00–17:00)."
  >
    <template #actions>
      <Button as-child
        ><RouterLink :to="{ name: routesPath.supportNew.name }">New ticket</RouterLink></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="We couldn’t load your tickets"
    description="Check your connection and try again."
  >
    <template #action>
      <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
    </template>
  </InlineNotice>

  <InlineNotice
    v-if="attention.length"
    tone="warning"
    :title="attentionTitle"
    :description="attention.map((t) => `${t.id} · ${t.subject}`).join(' · ')"
  >
    <template #action>
      <Button as-child variant="outline" size="sm">
        <RouterLink :to="{ name: routesPath.supportTicket.name, params: { id: attention[0]!.id } }"
          >Open {{ attention[0]!.id }}</RouterLink
        >
      </Button>
    </template>
  </InlineNotice>

  <TabNav :tabs="tabs" label="Support tickets" />

  <DataTable
    :columns="columns"
    :rows="data?.rows ?? []"
    :row-key="(t) => t.id"
    :row-label="(t) => t.subject"
    :loading="isPending"
    :meta="data?.meta"
    min-width="980px"
    :empty-text="emptyText"
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Ticket number, subject or category"
    /></template>
    <template #cell-subject="{ row }">
      <CellLink
        :to="{ name: routesPath.supportTicket.name, params: { id: row.id } }"
        :label="row.subject"
        :detail="`${row.id} · ${row.requester}`"
      />
    </template>
    <template #cell-priority="{ row }">
      <span :class="cn(row.priority !== 'Normal' && 'font-medium text-error-strong')">{{
        row.priority
      }}</span>
    </template>
    <template #cell-handler="{ row }">
      <span class="flex flex-col">
        <span :class="cn(!row.assignee && 'text-muted-foreground')">{{
          row.assignee ?? 'Not yet assigned'
        }}</span>
        <span class="text-xs text-faint">{{ row.assignee ? row.team : `${row.team} queue` }}</span>
      </span>
    </template>
    <template #cell-updated="{ row }">{{ fmtWhen(row.updatedAt) }}</template>
    <template #cell-status="{ row }">
      <span class="flex flex-col items-start gap-0.5">
        <StatusBadge :label="row.statusLabel" :tone="TICKET_TONE[row.status]" />
        <span
          v-if="row.status === 'Open' || row.sla.state === 'over'"
          :class="cn('text-xs', SLA_TONE[row.sla.state])"
          >{{ row.sla.label }}</span
        >
      </span>
    </template>
  </DataTable>
</template>
