<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useAnnouncementQuery } from '@/api/services/announcements';
import { formatDateTime } from '@/lib/dates';
import { getApiErrorMessage, isNotFound } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data, isPending, error } = useAnnouncementQuery(id);
watch(data, (a) => layout.setRecordLabel(a?.title ?? null), { immediate: true });
const paragraphs = computed(() => data.value?.body.split(/\n+/).filter(Boolean) ?? []);
</script>

<template>
  <template v-if="isPending">
    <Skeleton class="h-9 w-2/3" />
    <Skeleton class="h-40 w-full" />
  </template>
  <EmptyState
    v-else-if="error"
    :title="isNotFound(error) ? 'Announcement not found' : 'This announcement couldn’t load'"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.announcements.list.name }"
        >All announcements</RouterLink
      ></Button
    >
  </EmptyState>
  <template v-else-if="data">
    <PageHeader
      :title="data.title"
      :meta="[
        { label: 'From', value: `${data.author}, ${data.authorRole}` },
        { label: 'To', value: `${data.audience} · ${data.campuses}` },
        { label: 'Published', value: formatDateTime(data.publishedAt) },
      ]"
    />
    <article
      class="flex max-w-[68ch] flex-col gap-3 rounded-lg border bg-card px-5 py-4.5 text-sm leading-relaxed text-pretty max-sm:px-4"
    >
      <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
    </article>
  </template>
</template>
