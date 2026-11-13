<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { PinIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useAnnouncementsQuery } from '@/api/services/announcements';
import { routesPath as r } from '@/router/routes-path';

/** The latest three announcements for teachers, each opening the announcement. */
const announcements = useAnnouncementsQuery();
const latest = computed(() => (announcements.data.value ?? []).slice(0, 3));
</script>

<template>
  <SectionCard title="Announcements" flush>
    <template #actions>
      <Button as-child variant="ghost" size="sm"
        ><RouterLink :to="{ name: r.announcements.list.name }">See all</RouterLink></Button
      >
    </template>
    <div v-if="announcements.isPending.value" class="flex flex-col gap-2 p-4">
      <Skeleton v-for="i in 2" :key="i" class="h-12" />
    </div>
    <p v-else-if="announcements.error.value" class="px-4 py-5 text-[13px] text-muted-foreground">
      Announcements couldn’t load.
      <button
        type="button"
        class="font-medium text-primary hover:underline"
        @click="announcements.refetch()"
      >
        Try again
      </button>
    </p>
    <ul v-else-if="latest.length" class="flex flex-col divide-y divide-divider">
      <li v-for="a in latest" :key="a.id">
        <RouterLink
          :to="{ name: r.announcements.detail.name, params: { id: a.id } }"
          class="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-muted"
        >
          <span class="flex items-center gap-1.5 text-[13px] font-medium">
            <PinIcon v-if="a.pinned" class="size-3.5 shrink-0 text-primary" aria-label="Pinned" />
            <span class="min-w-0 truncate">{{ a.title }}</span>
          </span>
          <span class="truncate text-xs text-faint">{{ a.author }} · {{ a.when }}</span>
        </RouterLink>
      </li>
    </ul>
    <p v-else class="px-4 py-5 text-[13px] text-muted-foreground">No announcements yet.</p>
  </SectionCard>
</template>
