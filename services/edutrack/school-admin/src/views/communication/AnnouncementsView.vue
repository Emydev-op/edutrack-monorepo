<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useAnnouncementActionMutation,
  useAnnouncementsQuery,
  useDeleteAnnouncementMutation,
} from '@/api/services/communication';
import { routesPath } from '@/router/routes-path';
import type { AnnouncementRow, AnnouncementStatus } from '@/types';

import { commsTone, fmtCount } from './comms-tones';

const router = useRouter();
const confirm = useConfirm();
const status = useRouteQuery<string>('status', '');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

const { data, isPending, error } = useAnnouncementsQuery(() => ({
  status: status.value || undefined,
  search: debounced.value || undefined,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const action = useAnnouncementActionMutation();
const remove = useDeleteAnnouncementMutation();

const STATUSES: (AnnouncementStatus | '')[] = [
  '',
  'Sent',
  'Scheduled',
  'Draft',
  'Withdrawn',
  'Expired',
];
const tabs = computed(() =>
  STATUSES.map((s) => ({
    label: s || 'All',
    to: { query: s ? { status: s } : {} },
    active: status.value === s,
    count: data.value?.counts[s || 'All'],
  })),
);

const columns: Column[] = [
  { key: 'title', label: 'Announcement', width: 'minmax(260px,2.2fr)' },
  { key: 'audience', label: 'Audience', width: 'minmax(170px,1.3fr)' },
  { key: 'channels', label: 'Channels', width: 'minmax(130px,1fr)' },
  { key: 'by', label: 'By', width: 'minmax(130px,1fr)' },
  { key: 'date', label: 'Date', width: 'minmax(140px,1fr)' },
  { key: 'status', label: 'Status', width: '110px' },
];

const detail = (id: string) => ({
  name: routesPath.communication.announcementDetail.name,
  params: { id },
});

async function run(row: AnnouncementRow, kind: 'cancel' | 'duplicate') {
  try {
    const res = await action.mutateAsync({ id: row.id, action: kind });
    if (kind === 'duplicate') {
      toast.success('Copied as a new draft.');
      void router.push({
        name: routesPath.communication.announcementEdit.name,
        params: { id: res.id },
      });
    } else toast.success('Schedule cancelled. It’s a draft again.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}

function withdraw(row: AnnouncementRow) {
  void confirm({
    title: `Withdraw “${row.title}”?`,
    description: 'It disappears from the parent, student and staff portals.',
    details: [['Email and SMS', 'Already delivered and can’t be recalled']],
    input: {
      label: 'Reason (optional)',
      placeholder: 'e.g. Wrong date. A corrected notice follows.',
    },
    confirmLabel: 'Withdraw',
    tone: 'destructive',
    action: async ({ text }) => {
      await action.mutateAsync({ id: row.id, action: 'withdraw', reason: text });
      toast.success('Withdrawn from the portals.');
    },
  });
}

function del(row: AnnouncementRow) {
  void confirm({
    title: `Delete the draft “${row.title}”?`,
    description: 'Drafts haven’t been sent, so nobody has seen it. This can’t be undone.',
    confirmLabel: 'Delete draft',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(row.id);
      toast.success('Draft deleted.');
    },
  });
}

function actions(row: AnnouncementRow): RowAction[] {
  const list: RowAction[] = [{ label: 'View', to: detail(row.id) }];
  if (row.status === 'Draft' || row.status === 'Scheduled')
    list.push({
      label: 'Edit',
      to: { name: routesPath.communication.announcementEdit.name, params: { id: row.id } },
    });
  if (row.status === 'Scheduled')
    list.push({ label: 'Cancel schedule', onSelect: () => run(row, 'cancel') });
  list.push({ label: 'Duplicate', onSelect: () => run(row, 'duplicate') });
  if (row.status === 'Sent' && row.channels.includes('In-app'))
    list.push({ label: 'Withdraw', destructive: true, onSelect: () => withdraw(row) });
  if (row.status === 'Draft')
    list.push({ label: 'Delete draft', destructive: true, onSelect: () => del(row) });
  return list;
}

const filtered = computed(() => !!status.value || !!debounced.value);
</script>

<template>
  <PageHeader
    title="Announcements"
    description="Written by people for an audience. Automatic messages (invoice issued, result published) are in Delivery Logs."
  >
    <template #actions>
      <Button as-child>
        <RouterLink :to="{ name: routesPath.communication.announcementNew.name }"
          >New announcement</RouterLink
        >
      </Button>
    </template>
  </PageHeader>

  <MetricGrid>
    <MetricCard label="Sent this term" :value="data?.sentThisTerm" :loading="!data" />
    <MetricCard
      label="Scheduled"
      :value="data?.counts.Scheduled"
      :loading="!data"
      :to="{ query: { status: 'Scheduled' } }"
    />
    <MetricCard
      label="Drafts"
      :value="data?.counts.Draft"
      :loading="!data"
      :to="{ query: { status: 'Draft' } }"
    />
    <MetricCard
      label="SMS credit"
      :value="data ? `${fmtCount(data.smsCredit)} units` : undefined"
      :loading="!data"
      :hint="data && data.smsCredit < 2000 ? 'Running low' : 'Used by SMS'"
      :hint-tone="data && data.smsCredit < 2000 ? 'warning' : 'neutral'"
      :to="{ name: routesPath.settings.name, query: { tab: 'notifications' } }"
    />
  </MetricGrid>

  <TabNav :tabs="tabs" label="Announcement status" />

  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Announcements couldn’t load. Refresh to try again.') }}
  </p>
  <DataTable
    v-else
    :columns="columns"
    :rows="data?.rows ?? []"
    :row-key="(a) => a.id"
    :row-label="(a) => a.title"
    :loading="isPending"
    :meta="data?.meta"
    :actions="actions"
    min-width="1000px"
    :empty-text="
      filtered
        ? 'No announcements match. Clear the search or pick another status.'
        : 'No announcements yet. Write one to reach parents, students or staff.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Title, message or audience"
    /></template>
    <template #cell-title="{ row }">
      <CellLink :to="detail(row.id)" :label="row.title" :detail="row.snippet" />
    </template>
    <template #cell-audience="{ row }">
      <span class="flex flex-col">
        <span>{{ row.audience }}</span>
        <span v-if="row.recipients !== null" class="text-xs text-faint tabular-nums"
          >{{ fmtCount(row.recipients) }} recipients</span
        >
      </span>
    </template>
    <template #cell-channels="{ row }">{{ row.channels.join(' · ') || '—' }}</template>
    <template #cell-date="{ row }"
      ><span class="tabular-nums">{{ row.dateLabel }}</span></template
    >
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="commsTone(row.status)"
    /></template>
  </DataTable>
</template>
