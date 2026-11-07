<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useCommsOptionsQuery,
  useCommsSettingsQuery,
  useDeliveriesQuery,
  useRetryAllFailedMutation,
  useTemplatesQuery,
} from '@/api/services/communication';
import { routesPath } from '@/router/routes-path';

import { commsTone, deliveryTone, fmtCount } from './comms-tones';

const confirm = useConfirm();
const tab = useRouteQuery<string>('tab', 'log');
const channel = useRouteQuery<string>('channel', '');
const status = useRouteQuery<string>('status', '');
const event = useRouteQuery<string>('event', '');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

const { data: options } = useCommsOptionsQuery();
const eventKey = computed(() => options.value?.events.find((e) => e.label === event.value)?.key);
const { data, isPending, error } = useDeliveriesQuery(() => ({
  channel: channel.value || undefined,
  status: status.value || undefined,
  event: eventKey.value,
  search: debounced.value || undefined,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const { data: templates, isPending: templatesPending } = useTemplatesQuery();
const { data: settings, isPending: settingsPending } = useCommsSettingsQuery();
const retryAll = useRetryAllFailedMutation();

const tabs = computed(() =>
  [
    ['log', 'Delivery log'],
    ['templates', 'Templates'],
    ['events', 'Notification events'],
  ].map(([value, label]) => ({
    label: label!,
    to: { query: value === 'log' ? {} : { tab: value } },
    active: tab.value === value,
  })),
);

const logColumns: Column[] = [
  { key: 'title', label: 'Message', width: 'minmax(230px,1.8fr)' },
  { key: 'recipient', label: 'Recipient', width: 'minmax(160px,1.2fr)' },
  { key: 'channel', label: 'Channel', width: '90px' },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'at', label: 'Time', width: '120px' },
  { key: 'detail', label: 'Detail', width: 'minmax(180px,1.4fr)' },
];
const templateColumns: Column[] = [
  { key: 'label', label: 'Template', width: 'minmax(200px,1.4fr)' },
  { key: 'channels', label: 'Channels on', width: 'minmax(150px,1fr)' },
  { key: 'variables', label: 'Variables', width: 'minmax(260px,2.2fr)' },
  { key: 'customised', label: 'Wording', width: '110px' },
];
const eventColumns: Column[] = [
  { key: 'label', label: 'Event', width: 'minmax(200px,1.5fr)' },
  { key: 'who', label: 'Who is notified', width: 'minmax(150px,1fr)' },
  { key: 'channels', label: 'Channels', width: 'minmax(150px,1fr)' },
  { key: 'trigger', label: 'Sent from', width: 'minmax(180px,1.3fr)' },
  { key: 'active', label: 'Status', width: '90px' },
];

function retry() {
  const n = data.value?.summary.retryable ?? 0;
  void confirm({
    title: `Retry ${fmtCount(n)} SMS?`,
    description:
      'Messages that failed because the phone was off or out of coverage, and messages waiting for credit, are sent again. Each retry uses SMS credit.',
    details: [
      ['Not retried', 'Missing or invalid numbers. Fix them on the record, then send again.'],
    ],
    confirmLabel: 'Retry failed',
    action: async () => {
      const r = await retryAll.mutateAsync();
      toast.success(
        r.stillFailed
          ? `${fmtCount(r.retried - r.stillFailed)} went through. ${fmtCount(r.stillFailed)} still can’t be reached.`
          : `${fmtCount(r.retried)} sent again.`,
      );
    },
  });
}

const filtered = computed(
  () => !!(channel.value || status.value || event.value || debounced.value),
);
</script>

<template>
  <PageHeader
    title="Delivery Logs"
    description="Every message the system sends, by channel and outcome"
  />
  <TabNav :tabs="tabs" label="Delivery logs sections" />

  <template v-if="tab === 'templates'">
    <DataTable
      :columns="templateColumns"
      :rows="templates ?? []"
      :row-key="(t) => t.event"
      :loading="templatesPending"
      min-width="860px"
      description="The wording of automatic messages. Announcements are written each time."
    >
      <template #cell-label="{ row }">
        <CellLink
          :to="{ name: routesPath.communication.templateDetail.name, params: { id: row.event } }"
          :label="row.label"
          :detail="row.event"
        />
      </template>
      <template #cell-channels="{ row }">{{ row.channels.join(' · ') || 'All off' }}</template>
      <template #cell-variables="{ row }">
        <span class="text-xs text-muted-foreground">{{
          row.variables.map((v) => `[${v}]`).join(' ')
        }}</span>
      </template>
      <template #cell-customised="{ row }">
        <StatusBadge
          :label="row.customised ? 'Customised' : 'Default'"
          :tone="row.customised ? 'info' : 'neutral'"
        />
      </template>
    </DataTable>
  </template>

  <template v-else-if="tab === 'events'">
    <DataTable
      :columns="eventColumns"
      :rows="settings?.events ?? []"
      :row-key="(e) => e.key"
      :loading="settingsPending"
      min-width="900px"
    >
      <template #toolbar>
        <Button as-child variant="outline" size="sm">
          <RouterLink :to="{ name: routesPath.settings.name, query: { tab: 'notifications' } }"
            >Change channels</RouterLink
          >
        </Button>
      </template>
      <template #cell-label="{ row }">
        <span class="flex flex-col">
          <span class="font-medium">{{ row.label }}</span>
          <span class="text-xs text-faint">{{ row.description }}</span>
        </span>
      </template>
      <template #cell-channels="{ row }">
        {{ row.key === 'announcement' ? 'As chosen' : row.channels.join(' · ') || 'None' }}
      </template>
      <template #cell-active="{ row }">
        <StatusBadge
          :label="row.active ? 'On' : 'Off'"
          :tone="commsTone(row.active ? 'On' : 'Off')"
        />
      </template>
    </DataTable>
  </template>

  <template v-else>
    <MetricGrid>
      <MetricCard
        label="Messages today"
        :value="data ? fmtCount(data.summary.today) : undefined"
        :loading="!data"
      />
      <MetricCard
        label="Delivered, last 7 days"
        :value="
          data
            ? data.summary.deliveredRate === null
              ? '—'
              : `${data.summary.deliveredRate}%`
            : undefined
        "
        :loading="!data"
      />
      <MetricCard
        label="Failed, last 7 days"
        :value="data ? fmtCount(data.summary.failed) : undefined"
        :loading="!data"
        :hint="
          data?.summary.retryable
            ? `${fmtCount(data.summary.retryable)} can be retried`
            : 'Nothing to retry'
        "
        :hint-tone="data?.summary.retryable ? 'warning' : 'neutral'"
      />
      <MetricCard
        label="Queued"
        :value="data ? fmtCount(data.summary.queued) : undefined"
        :loading="!data"
        hint="Quiet hours, credit or portal not activated"
      />
    </MetricGrid>

    <p v-if="error" class="text-sm text-error-strong">
      {{ getApiErrorMessage(error, 'The delivery log couldn’t load. Refresh to try again.') }}
    </p>
    <DataTable
      v-else
      :columns="logColumns"
      :rows="data?.rows ?? []"
      :row-key="(r) => r.id"
      :row-label="(r) => r.title"
      :loading="isPending"
      :meta="data?.meta"
      min-width="1040px"
      :empty-text="
        filtered
          ? 'No messages match. Clear the search or filters.'
          : 'No messages yet. Invoices, payments, invitations and announcements show here once sent.'
      "
      @update:page="page = String($event)"
      @update:page-size="pageSize = String($event)"
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Message or recipient"
      /></template>
      <template #filters>
        <FilterMenu v-model="channel" label="Channel" :options="['In-app', 'Email', 'SMS']" />
        <FilterMenu
          v-model="status"
          label="Status"
          :options="['Delivered', 'Read', 'Sent', 'Queued', 'Failed']"
        />
        <FilterMenu
          v-model="event"
          label="Message type"
          :options="options?.events.map((e) => e.label) ?? []"
        />
      </template>
      <template #toolbar>
        <Button
          variant="outline"
          size="sm"
          :disabled="!data?.summary.retryable || retryAll.isPending.value"
          @click="retry"
          >Retry failed</Button
        >
      </template>
      <template #cell-title="{ row }">
        <CellLink
          :to="{
            name: routesPath.communication.deliveryDetail.name,
            params: { id: row.messageId },
          }"
          :label="row.title"
          :detail="row.eventLabel"
        />
      </template>
      <template #cell-status="{ row }"
        ><StatusBadge :label="row.status" :tone="deliveryTone(row.status)"
      /></template>
      <template #cell-at="{ row }"
        ><span class="tabular-nums">{{ row.atLabel }}</span></template
      >
      <template #cell-detail="{ row }">
        <span :class="cn('text-xs', row.failed ? 'text-error-strong' : 'text-muted-foreground')">{{
          row.detail || '—'
        }}</span>
      </template>
    </DataTable>
  </template>
</template>
