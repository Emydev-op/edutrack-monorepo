<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { refDebounced } from '@vueuse/core';
import { PinIcon } from '@lucide/vue';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';

import { useAnnouncementsQuery } from '@/api/services/announcements';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';

const search = ref('');
const { data, isPending, error } = useAnnouncementsQuery(refDebounced(search, 250));
</script>

<template>
  <PageHeader
    title="Announcements"
    description="From the school to teachers and the whole school. Read-only."
  />
  <SearchInput v-model="search" placeholder="Search announcements" class="max-w-sm" />
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Announcements couldn’t load. Refresh to try again.') }}
  </p>
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
  </div>
  <EmptyState
    v-else-if="!data?.length"
    :title="search ? 'No announcements match your search' : 'No announcements yet'"
    description="Announcements from the school office appear here."
  />
  <ul v-else class="flex flex-col gap-3">
    <li v-for="a in data" :key="a.id">
      <RouterLink
        :to="{ name: routesPath.announcements.detail.name, params: { id: a.id } }"
        class="flex flex-col gap-1.5 rounded-lg border bg-card px-4.5 py-3.5 hover:border-[#D9D5CD] hover:bg-surface-warm"
      >
        <span class="flex flex-wrap items-center gap-2">
          <PinIcon v-if="a.pinned" class="size-3.5 text-primary" aria-label="Pinned" />
          <span class="text-[15px] font-semibold text-balance">{{ a.title }}</span>
        </span>
        <span class="line-clamp-2 text-[13px] text-pretty text-muted-foreground">{{
          a.summary
        }}</span>
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <StatusBadge :label="a.audience" tone="neutral" :dot="false" />
          <span>{{ a.campuses }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ a.author }}, {{ a.authorRole }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ a.when }}</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
