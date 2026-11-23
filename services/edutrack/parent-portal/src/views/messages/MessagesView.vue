<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { SquarePenIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';

import { useMessagesQuery } from '@/api/services/messages';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { timeAgo } from '@/lib/messages';
import { routesPath } from '@/router/routes-path';

/** Conversations with the school and the children’s teachers, newest first. */
const q = useMessagesQuery();
const list = computed(() => q.data.value);
</script>

<template>
  <div class="flex items-end justify-between gap-3">
    <PageTitle
      title="Messages"
      :sub="list ? (list.unread ? `${list.unread} unread` : 'With the school and teachers') : null"
    />
    <Button as-child size="sm" class="shrink-0">
      <RouterLink :to="{ name: routesPath.messages.create.name }"
        ><SquarePenIcon aria-hidden="true" /> New message</RouterLink
      >
    </Button>
  </div>
  <QueryState
    v-if="!list"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <EmptyState
    v-else-if="!list.conversations.length"
    title="No messages yet"
    description="Write to the school office or one of your child’s teachers. Replies show here and arrive by email."
  >
    <Button as-child variant="outline" size="sm">
      <RouterLink :to="{ name: routesPath.messages.create.name }">New message</RouterLink>
    </Button>
  </EmptyState>
  <nav v-else aria-label="Conversations" class="overflow-hidden rounded-lg border bg-card">
    <RouterLink
      v-for="c in list.conversations"
      :key="c.id"
      :to="{ name: routesPath.messages.thread.name, params: { id: c.id } }"
      class="flex items-start gap-3 border-t border-divider px-3.5 py-3 first:border-t-0 hover:bg-surface-warm"
    >
      <span
        class="mt-1.5 size-2 shrink-0 rounded-full"
        :class="c.unread ? 'bg-primary' : 'bg-transparent'"
        aria-hidden="true"
      />
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-sm" :class="{ 'font-semibold': c.unread }">{{
            c.with
          }}</span>
          <span v-if="c.lastMessage" class="shrink-0 text-xs whitespace-nowrap text-faint">{{
            timeAgo(c.lastMessage.at)
          }}</span>
        </span>
        <span class="truncate text-[13px]" :class="c.unread ? 'font-medium' : 'text-body'">{{
          c.subject
        }}</span>
        <span v-if="c.lastMessage" class="line-clamp-2 text-xs text-muted-foreground"
          >{{ c.lastMessage.fromMe ? 'You: ' : '' }}{{ c.lastMessage.body }}</span
        >
        <span v-if="c.about" class="text-[11px] text-faint">About {{ c.about }}</span>
      </span>
      <span
        v-if="c.unread"
        class="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
        :aria-label="`${c.unread} unread`"
        >{{ c.unread > 9 ? '9+' : c.unread }}</span
      >
    </RouterLink>
  </nav>
</template>
