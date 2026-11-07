<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useModulesQuery } from '@/api/services/settings';
import type { ModuleStatus } from '@/types';

import { supportLink } from '../settings-shared';

const { data, isPending, isError, refetch } = useModulesQuery();

const TONE: Record<ModuleStatus, StatusTone> = {
  Active: 'success',
  'Not on plan': 'neutral',
  'Coming soon': 'info',
};
</script>

<template>
  <div v-if="isPending"><Skeleton class="h-80 w-full" /></div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Modules couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <SectionCard
    v-else
    flush
    title="Modules"
    description="Modules come with your plan. Coming-soon modules aren’t available yet."
  >
    <ul>
      <li
        v-for="m in data"
        :key="m.name"
        class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-divider px-4 py-3 text-[13px] last:border-b-0"
      >
        <span class="flex min-w-[200px] flex-[1_1_240px] flex-col">
          <span class="font-medium">{{ m.name }}</span>
          <span class="text-xs text-muted-foreground">{{ m.covers }}</span>
        </span>
        <StatusBadge :label="m.status" :tone="TONE[m.status]" />
        <RouterLink
          v-if="m.status === 'Not on plan'"
          :to="
            supportLink(
              'Account & billing',
              `Add ${m.name} to our plan`,
              `We would like to add the ${m.name} module to our plan.`,
            )
          "
          class="text-xs font-medium text-primary hover:underline"
          >Request</RouterLink
        >
      </li>
    </ul>
  </SectionCard>
</template>
