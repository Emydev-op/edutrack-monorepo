<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ref } from 'vue';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useSettingsHistoryQuery } from '@/api/services/settings';
import type { SettingsArea } from '@/types';

import { fmtDateTime } from './settings-shared';

const open = defineModel<boolean>('open', { required: true });

const area = ref<SettingsArea | ''>('');
const AREAS: { value: SettingsArea | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'School', label: 'School' },
  { value: 'Academic', label: 'Academic' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Security', label: 'Security' },
];
const { data, isPending, isError } = useSettingsHistoryQuery(area);
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Change history"
    description="Every settings change, who made it and when. Notification changes are listed in Communication → Delivery Logs."
  >
    <SegmentedControl v-model="area" :options="AREAS" label="Filter by area" />
    <div v-if="isPending" class="flex flex-col gap-2">
      <Skeleton v-for="i in 4" :key="i" class="h-14 w-full" />
    </div>
    <InlineNotice
      v-else-if="isError"
      tone="error"
      title="The history couldn’t load"
      description="Close this panel and try again."
    />
    <p v-else-if="!data?.length" class="text-[13px] text-muted-foreground">
      {{
        area
          ? `No ${area.toLowerCase()} settings have changed yet.`
          : 'No settings have changed yet.'
      }}
    </p>
    <ol v-else class="flex flex-col">
      <li
        v-for="h in data"
        :key="h.id"
        class="flex flex-col gap-1 border-b border-divider py-3 text-[13px] last:border-b-0"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium">{{ h.setting }}</span>
          <StatusBadge :label="h.area" tone="neutral" :dot="false" />
        </div>
        <span class="text-body">
          <span class="text-muted-foreground line-through">{{ h.from }}</span>
          → <span class="font-medium">{{ h.to }}</span>
        </span>
        <span class="text-xs text-faint">{{ h.by }} · {{ fmtDateTime(h.at) }}</span>
      </li>
    </ol>
  </SideDrawer>
</template>
