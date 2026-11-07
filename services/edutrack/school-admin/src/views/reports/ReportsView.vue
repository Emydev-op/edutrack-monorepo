<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useReportCatalogQuery } from '@/api/services/reports';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';

import { GROUP_HINTS } from './report-groups';

const context = useContextStore();
const { data, isPending, isError, refetch } = useReportCatalogQuery();
</script>

<template>
  <PageHeader
    title="Reports"
    :description="`Every report is worked out from your live records for ${context.current.branch}. Export any of them to CSV or print it.`"
  />

  <InlineNotice
    v-if="isError"
    tone="error"
    title="Reports couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>

  <div v-else-if="isPending" class="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
    <Skeleton v-for="i in 4" :key="i" class="h-56 rounded-lg" />
  </div>

  <div v-else-if="data" class="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
    <section
      v-for="group in data.groups"
      :key="group.name"
      class="flex flex-col rounded-lg border bg-card"
      :aria-labelledby="`group-${group.name}`"
    >
      <header class="border-b border-divider px-4 py-3.5">
        <h2 :id="`group-${group.name}`" class="text-[15px] font-semibold">{{ group.name }}</h2>
        <p class="text-xs text-muted-foreground">{{ GROUP_HINTS[group.name] }}</p>
      </header>
      <ul class="flex flex-col">
        <li
          v-for="rep in group.reports"
          :key="rep.id"
          class="border-t border-divider first:border-t-0"
        >
          <RouterLink
            :to="{ name: routesPath.reportDetail.name, params: { id: rep.id } }"
            class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-sm font-medium">{{ rep.title }}</span>
              <span class="text-xs text-muted-foreground">{{ rep.description }}</span>
            </span>
            <ChevronRightIcon class="size-4 shrink-0 text-faint" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
