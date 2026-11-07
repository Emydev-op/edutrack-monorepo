<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useInboxQuery,
  useMarkAllReadMutation,
  useMarkReadMutation,
} from '@/api/services/communication';
import type { InboxItem } from '@/types';

const router = useRouter();
const filter = useRouteQuery<string>('filter', 'all');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const { data, isPending, error } = useInboxQuery(() => ({
  filter: filter.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const markRead = useMarkReadMutation();
const markAll = useMarkAllReadMutation();

const tabs = computed(() => [
  { label: 'All', to: { query: {} }, active: filter.value !== 'unread', count: data.value?.total },
  {
    label: 'Unread',
    to: { query: { filter: 'unread' } },
    active: filter.value === 'unread',
    count: data.value?.unread,
  },
]);

const columns: Column[] = [
  { key: 'title', label: 'Notification', width: 'minmax(280px,2.6fr)' },
  { key: 'when', label: 'When', width: '130px' },
  { key: 'status', label: 'Status', width: '100px' },
];

async function open(n: InboxItem) {
  try {
    if (n.unread) await markRead.mutateAsync(n.id);
  } catch {
    // Opening the record matters more than the read marker.
  }
  void router.push(n.to);
}

async function readAll() {
  try {
    await markAll.mutateAsync();
    toast.success('All notifications marked as read.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}
</script>

<template>
  <PageHeader
    title="Notifications"
    :description="
      data ? (data.unread ? `${data.unread} unread` : 'You’re all caught up') : undefined
    "
  >
    <template #actions>
      <Button
        variant="outline"
        :disabled="!data?.unread || markAll.isPending.value"
        @click="readAll"
        >Mark all as read</Button
      >
    </template>
  </PageHeader>
  <TabNav :tabs="tabs" label="Notification filter" />
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Notifications couldn’t load. Refresh to try again.') }}
  </p>
  <DataTable
    v-else
    :columns="columns"
    :rows="data?.rows ?? []"
    :row-key="(n) => n.id"
    :row-label="(n) => n.title"
    :loading="isPending"
    :meta="data?.meta"
    min-width="560px"
    :empty-text="
      filter === 'unread'
        ? 'No unread notifications. New payments, scheduled sends and support replies appear here.'
        : 'No notifications yet.'
    "
    description="Opening one marks it read and takes you to the related record."
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #cell-title="{ row }">
      <button type="button" class="flex flex-col text-left hover:underline" @click="open(row)">
        <span :class="cn('text-[13px]', row.unread ? 'font-semibold' : 'font-normal')">{{
          row.title
        }}</span>
        <span class="text-xs text-faint">{{ row.detail }}</span>
      </button>
    </template>
    <template #cell-when="{ row }"
      ><span class="tabular-nums">{{ row.when }}</span></template
    >
    <template #cell-status="{ row }">
      <StatusBadge
        :label="row.unread ? 'Unread' : 'Read'"
        :tone="row.unread ? 'info' : 'neutral'"
      />
    </template>
  </DataTable>
</template>
