<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useCloseIncidentMutation, useIncidentsQuery } from '@/api/services/boarding';
import IncidentDrawer from '@/components/boarding/IncidentDrawer.vue';
import { getApiErrorMessage } from '@/lib/api-errors';
import type { BoardingIncident } from '@/types';

type StatusFilter = 'Open' | 'Closed' | 'all';
const status = useRouteQuery<StatusFilter>('status', 'Open');
const STATUS_OPTIONS = [
  { value: 'Open' as const, label: 'Open' },
  { value: 'Closed' as const, label: 'Closed' },
  { value: 'all' as const, label: 'All' },
];

const { data, isPending, error } = useIncidentsQuery(() => ({
  status: status.value === 'all' ? '' : status.value,
}));
const incidents = computed(() => data.value?.incidents ?? []);
const closeIncident = useCloseIncidentMutation();
const confirm = useConfirm();
const recording = ref(false);

const close = (i: BoardingIncident) =>
  confirm({
    title: `Close this incident?`,
    description: `${i.category} · ${i.student.name}, ${i.when}`,
    input: {
      label: 'Action taken (optional)',
      placeholder: i.action ?? 'e.g. Spoke with the boarder and their parents',
    },
    confirmLabel: 'Close incident',
    action: async ({ text }) => {
      await closeIncident.mutateAsync({ id: i.id, action: text || undefined });
      toast.success('Incident closed');
    },
  });
</script>

<template>
  <PageHeader
    title="Incidents"
    description="Incidents in the hostels you look after. Share one with parents when they should know."
  >
    <template #actions>
      <Button class="h-10" @click="recording = true"
        ><PlusIcon class="size-4" /> Record incident</Button
      >
    </template>
  </PageHeader>

  <SegmentedControl v-model="status" :options="STATUS_OPTIONS" label="Status" />

  <InlineNotice
    v-if="error"
    tone="error"
    title="Incidents couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
  </div>
  <EmptyState
    v-else-if="!incidents.length"
    illustrated
    :title="status === 'Open' ? 'No open incidents' : 'No incidents'"
    description="Record an incident from here or from a boarder on My hostel."
  />
  <SectionCard v-else flush>
    <ul class="flex flex-col divide-y divide-divider">
      <li
        v-for="i in incidents"
        :key="i.id"
        class="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[14px] font-medium">{{ i.student.name }}</span>
            <StatusBadge :label="i.category" tone="neutral" :dot="false" />
            <StatusBadge :label="i.status" />
            <StatusBadge
              v-if="i.sharedWithParent"
              label="Shared with parents"
              tone="info"
              :dot="false"
            />
          </div>
          <span class="text-[13px]">{{ i.description }}</span>
          <span v-if="i.action" class="text-xs"
            ><span class="text-muted-foreground">Action:</span> {{ i.action }}</span
          >
          <span class="text-xs text-muted-foreground"
            >{{ i.when }}{{ i.hostel ? ` · ${i.hostel}` : ''
            }}{{ i.reportedBy ? ` · reported by ${i.reportedBy}` : '' }}</span
          >
        </div>
        <Button v-if="i.status === 'Open'" variant="outline" class="h-10 shrink-0" @click="close(i)"
          >Close</Button
        >
      </li>
    </ul>
  </SectionCard>

  <IncidentDrawer v-model:open="recording" />
</template>
