<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAnnouncementsQuery } from '@/api/services/parent';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';

/** News from the school for this family's children and classes. */
const route = useRoute();
const { overview } = useCurrentChild();
const q = useAnnouncementsQuery();

// Opened from Home: scroll to the announcement.
watch(
  () => q.data.value,
  async (list) => {
    if (!list || !route.hash) return;
    await nextTick();
    document.querySelector(route.hash)?.scrollIntoView({ block: 'start' });
  },
  { immediate: true },
);
</script>

<template>
  <PageTitle
    title="Announcements"
    :sub="`From ${overview.data.value?.school.name ?? 'the school'}`"
  />
  <QueryState
    v-if="!q.data.value"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <p
    v-else-if="!q.data.value.length"
    class="rounded-lg border bg-card px-3.5 py-4 text-muted-foreground"
  >
    No announcements right now. News from the school appears here.
  </p>
  <article
    v-for="a in q.data.value ?? []"
    :id="`a-${a.id}`"
    :key="a.id"
    class="flex scroll-mt-4 flex-col gap-1.5 rounded-lg border bg-card px-3.5 py-3"
  >
    <h2 class="text-sm font-semibold">{{ a.title }}</h2>
    <p class="text-xs text-faint">{{ a.from }} · {{ a.date }} · {{ a.audience }}</p>
    <p class="text-sm whitespace-pre-line text-body">{{ a.body }}</p>
  </article>
</template>
