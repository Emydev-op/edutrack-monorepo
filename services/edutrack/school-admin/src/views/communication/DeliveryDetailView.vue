<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useDeliveryQuery, useRetryDeliveryMutation } from '@/api/services/communication';
import { routesPath } from '@/router/routes-path';

import ChannelStats from './ChannelStats.vue';
import { deliveryTone, fmtCount, fmtStamp } from './comms-tones';

const route = useRoute();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const channel = useRouteQuery<string>('channel', '');
const status = useRouteQuery<string>('status', '');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

const {
  data: m,
  isPending,
  error,
} = useDeliveryQuery(id, () => ({
  channel: channel.value || undefined,
  status: status.value || undefined,
  search: debounced.value || undefined,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const retry = useRetryDeliveryMutation();

const details = computed(() => {
  const x = m.value;
  if (!x) return [];
  return [
    { label: 'Type', value: x.eventLabel },
    { label: 'Sent', value: fmtStamp(x.at) },
    { label: 'Sent by', value: x.by },
    { label: 'Audience', value: x.audience },
    ...(x.stats.some((s) => s.channel === 'SMS')
      ? [
          { label: 'SMS sender', value: x.sender },
          { label: 'SMS units used', value: fmtCount(x.smsUnits) },
        ]
      : []),
  ];
});

const columns: Column[] = [
  { key: 'name', label: 'Recipient', width: 'minmax(180px,1.2fr)' },
  { key: 'outcomes', label: 'Outcome by channel', width: 'minmax(420px,3fr)' },
];

function doRetry() {
  const n = m.value?.retryable ?? 0;
  void confirm({
    title: `Retry ${fmtCount(n)} SMS?`,
    description: 'Each retry uses SMS credit. Missing or invalid numbers aren’t retried.',
    confirmLabel: 'Retry',
    action: async () => {
      const r = await retry.mutateAsync(id.value);
      toast.success(
        r.stillFailed
          ? `${fmtCount(r.retried - r.stillFailed)} went through. ${fmtCount(r.stillFailed)} still can’t be reached.`
          : `${fmtCount(r.retried)} sent again.`,
      );
    },
  });
}
</script>

<template>
  <EmptyState v-if="error" title="Message not found" description="The link may be wrong.">
    <Button as-child variant="outline">
      <RouterLink :to="{ name: routesPath.communication.delivery.name }"
        >Back to delivery logs</RouterLink
      >
    </Button>
  </EmptyState>
  <p v-else-if="isPending || !m" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader :title="m.title" :description="`${m.eventLabel} · ${m.atLabel} · ${m.audience}`">
      <template #actions>
        <Button v-if="m.source" as-child variant="outline">
          <RouterLink :to="m.source.to">Open {{ m.source.label }}</RouterLink>
        </Button>
        <Button :disabled="!m.retryable || retry.isPending.value" @click="doRetry">
          Retry failed{{ m.retryable ? ` (${fmtCount(m.retryable)})` : '' }}
        </Button>
      </template>
    </PageHeader>

    <div class="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <SectionCard title="Outcome">
        <ChannelStats :stats="m.stats" />
      </SectionCard>
      <KeyValueCard title="Details" :rows="details" />
    </div>

    <SectionCard
      title="What was sent"
      :description="m.content.length ? 'Shown for the first recipient' : ''"
    >
      <div class="grid gap-3 md:grid-cols-3 [&>*]:min-w-0">
        <div
          v-for="c in m.content"
          :key="c.channel"
          class="flex flex-col gap-1 rounded-md border px-3 py-2.5 text-[13px]"
        >
          <p class="text-xs font-medium text-muted-foreground">{{ c.channel }}</p>
          <p v-if="c.subject" class="font-medium">{{ c.subject }}</p>
          <p class="whitespace-pre-line break-words">{{ c.body }}</p>
        </div>
      </div>
    </SectionCard>

    <DataTable
      title="Recipients"
      :columns="columns"
      :rows="m.rows"
      :row-key="(r) => r.key"
      :row-label="(r) => r.name"
      :meta="m.meta"
      min-width="720px"
      empty-text="No recipients match. Clear the search or filters."
      @update:page="page = String($event)"
      @update:page-size="pageSize = String($event)"
    >
      <template #search
        ><SearchInput v-model="search" placeholder="Name, email or phone"
      /></template>
      <template #filters>
        <FilterMenu v-model="channel" label="Channel" :options="m.stats.map((s) => s.channel)" />
        <FilterMenu
          v-model="status"
          label="Status"
          :options="['Delivered', 'Read', 'Sent', 'Queued', 'Failed']"
        />
      </template>
      <template #cell-name="{ row }">
        <span class="flex flex-col">
          <span class="font-medium">{{ row.name }}</span>
          <span class="text-xs text-faint">{{ row.role }}</span>
        </span>
      </template>
      <template #cell-outcomes="{ row }">
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="o in row.outcomes"
            :key="o.channel"
            class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]"
          >
            <span class="w-14 shrink-0 text-xs text-muted-foreground">{{ o.channel }}</span>
            <StatusBadge :label="o.status" :tone="deliveryTone(o.status)" />
            <span class="text-xs text-faint">{{ o.address || '—' }}</span>
            <span
              v-if="o.detail"
              class="text-xs"
              :class="o.status === 'Failed' ? 'text-error-strong' : 'text-muted-foreground'"
            >
              {{ o.detail }}
            </span>
            <RouterLink
              v-if="o.fix"
              :to="o.fix"
              class="text-xs font-medium text-primary hover:underline"
              >Fix contact</RouterLink
            >
          </li>
        </ul>
      </template>
    </DataTable>
  </template>
</template>
