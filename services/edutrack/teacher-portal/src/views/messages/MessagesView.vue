<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronRightIcon, PlusIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useConversationsQuery } from '@/api/services/messages';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatRelative } from '@/lib/relative-time';
import { routesPath as r } from '@/router/routes-path';

const { data, isPending, error } = useConversationsQuery();
const search = useRouteQuery<string>('q', '');

// Newest first, whatever order the API sends.
const conversations = computed(() => {
  const q = search.value.trim().toLowerCase();
  return [...(data.value?.conversations ?? [])]
    .filter(
      (c) =>
        !q || [c.with, c.subject, c.about ?? ''].some((field) => field.toLowerCase().includes(q)),
    )
    .sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''));
});
</script>

<template>
  <PageHeader
    title="Messages"
    description="Conversations with the parents of students you teach. Parents get an email when you write."
  >
    <template #actions>
      <Button as-child
        ><RouterLink :to="{ name: r.messages.new.name }"
          ><PlusIcon class="size-4" /> New message</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Your messages couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton v-for="i in 6" :key="i" class="h-16 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !data.conversations.length"
    illustrated
    title="No messages yet"
    description="Write to a parent about one of your students, or wait for a parent to write to you. Conversations appear here."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.messages.new.name }">New message</RouterLink></Button
    >
  </EmptyState>
  <template v-else-if="data">
    <SearchInput v-model="search" placeholder="Search by parent, student or subject" />
    <p
      v-if="!conversations.length"
      class="rounded-lg border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground"
    >
      No conversations match “{{ search }}”.
    </p>
    <ul v-else class="flex flex-col divide-y divide-divider rounded-lg border bg-card">
      <li v-for="c in conversations" :key="c.id">
        <RouterLink
          :to="{ name: r.messages.thread.name, params: { id: c.id } }"
          class="flex items-center gap-3 px-4 py-3 hover:bg-surface-warm max-sm:px-3"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-baseline justify-between gap-3">
              <span :class="cn('truncate', c.unread ? 'font-semibold' : 'font-medium')"
                >{{ c.with
                }}<span v-if="c.about" class="font-normal text-muted-foreground">
                  · about {{ c.about }}</span
                ></span
              >
              <span
                v-if="c.lastMessage"
                class="shrink-0 text-xs whitespace-nowrap text-faint"
                :title="new Date(c.lastMessage.at).toLocaleString()"
                >{{ formatRelative(c.lastMessage.at) }}</span
              >
            </span>
            <span :class="cn('truncate text-[13px]', c.unread && 'font-medium')">{{
              c.subject
            }}</span>
            <span v-if="c.lastMessage" class="truncate text-xs text-muted-foreground"
              ><template v-if="c.lastMessage.fromMe">You: </template>{{ c.lastMessage.body }}</span
            >
          </span>
          <span
            v-if="c.unread"
            class="shrink-0 rounded-[3px] bg-highlight-subtle px-1.5 text-[11px] text-warning-strong"
            :aria-label="`${c.unread} unread`"
            >{{ c.unread }}</span
          >
          <ChevronRightIcon class="size-4 shrink-0 text-faint" />
        </RouterLink>
      </li>
    </ul>
  </template>
</template>
