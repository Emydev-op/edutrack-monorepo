<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { RouterLink } from 'vue-router';

import { useAttentionQuery, useRecentActivityQuery } from '@/api/services/dashboard';
import { routesPath } from '@/router/routes-path';

const { data: items, isPending } = useAttentionQuery();
const { data: activity, isPending: activityPending } = useRecentActivityQuery();
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <section class="rounded-lg border bg-card">
      <h2 class="border-b border-divider px-4 py-3.5 text-[15px] font-semibold">Needs attention</h2>
      <Skeleton v-if="isPending" class="m-4 h-40" />
      <div
        v-for="item in items"
        :key="item.id"
        class="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-divider px-4 py-2.75 last:border-b-0"
      >
        <StatusBadge :label="item.status" class="justify-self-start" />
        <div class="flex min-w-0 flex-col">
          <span class="text-[13px]">{{ item.text }}</span>
          <span class="text-xs text-faint">{{ item.context }}</span>
        </div>
        <Button as-child variant="outline" size="xs" class="h-7 px-2.5 text-xs hover:bg-[#F7EFE6]">
          <RouterLink :to="item.to">{{ item.action }}</RouterLink>
        </Button>
      </div>
    </section>

    <section class="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5">
      <div class="flex justify-between">
        <h2 class="text-[15px] font-semibold">Recent platform activity</h2>
        <RouterLink
          :to="{ name: routesPath.activity.name }"
          class="text-[13px] text-primary hover:underline"
          >All activity</RouterLink
        >
      </div>
      <Skeleton v-if="activityPending" class="h-40" />
      <RouterLink
        v-for="entry in activity"
        :key="entry.id"
        :to="{ name: routesPath.audit.name }"
        class="grid grid-cols-[12px_1fr_auto] gap-2.5 rounded-sm py-0.5 text-[13px] hover:bg-surface-warm"
      >
        <span
          class="mt-1.5 size-2 rounded-full"
          :class="
            entry.entity === 'School'
              ? 'bg-error'
              : entry.entity === 'Issue'
                ? 'bg-info'
                : 'bg-success'
          "
        />
        <span class="flex flex-col">
          <span>{{ entry.summary }}</span>
          <span class="text-xs text-faint"
            >{{ entry.actor }}{{ entry.schoolName !== '—' ? ` · ${entry.schoolName}` : '' }}</span
          >
        </span>
        <span class="text-xs whitespace-nowrap text-faint">{{ entry.when }}</span>
      </RouterLink>
    </section>
  </div>
</template>
