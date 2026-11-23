<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { PenSquareIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { isForbidden, useMessagesQuery } from '@/api/services/messages';
import { routesPath } from '@/router/routes-path';

import { fmtAgo } from './comms-tones';
import NewMessageDialog from './NewMessageDialog.vue';

/** The school office's conversations with parents, newest first. */
const { data, isPending, error } = useMessagesQuery();
const composing = ref(false);

const conversations = computed(() =>
  [...(data.value?.conversations ?? [])].sort((a, b) =>
    (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''),
  ),
);
const forbidden = computed(() => isForbidden(error.value));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const thread = (id: string) => ({
  name: routesPath.communication.messageThread.name,
  params: { id },
});
</script>

<template>
  <PageHeader
    title="Messages"
    :description="
      data?.unread
        ? `${data.unread} unread. Conversations between parents and the school office.`
        : 'Conversations between parents and the school office. Teachers’ own conversations stay with them.'
    "
  >
    <template v-if="!forbidden" #actions>
      <Button @click="composing = true"><PenSquareIcon /> New message</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="forbidden"
    tone="warning"
    title="Only staff with school-wide messaging can read the school’s messages"
    description="Ask an administrator to give your role Communication · School in Users & Roles."
  />
  <p v-else-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Messages couldn’t load. Refresh to try again.') }}
  </p>

  <SectionCard v-else flush>
    <ul v-if="isPending" class="divide-y divide-divider" aria-label="Loading conversations">
      <li v-for="n in 5" :key="n" class="flex items-center gap-3 px-4 py-3.5">
        <Skeleton class="size-9 rounded-full" />
        <div class="flex flex-1 flex-col gap-1.5">
          <Skeleton class="h-3.5 w-40" />
          <Skeleton class="h-3 w-3/4" />
        </div>
      </li>
    </ul>

    <EmptyState
      v-else-if="!conversations.length"
      illustrated
      title="No messages yet"
      description="When a parent writes to the school, or you write to one, the conversation shows here."
    >
      <Button @click="composing = true">New message</Button>
    </EmptyState>

    <ul v-else class="divide-y divide-divider" aria-label="Conversations">
      <li v-for="c in conversations" :key="c.id">
        <RouterLink
          :to="thread(c.id)"
          class="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <InitialsAvatar :initials="initials(c.with)" />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <div class="flex items-baseline justify-between gap-3">
              <span :class="cn('truncate text-sm', c.unread ? 'font-semibold' : 'font-medium')">{{
                c.with
              }}</span>
              <span
                v-if="c.lastMessage"
                :class="
                  cn(
                    'shrink-0 text-xs tabular-nums',
                    c.unread ? 'font-medium text-brand-strong' : 'text-faint',
                  )
                "
                >{{ fmtAgo(c.lastMessage.at) }}</span
              >
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="flex min-w-0 items-baseline gap-1.5">
                <span :class="cn('truncate text-[13px]', c.unread && 'font-medium')">{{
                  c.subject
                }}</span>
                <span v-if="c.about" class="shrink-0 text-xs text-muted-foreground"
                  >· About {{ c.about }}</span
                >
              </span>
              <span
                v-if="c.unread"
                class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
                :aria-label="`${c.unread} unread`"
                >{{ c.unread }}</span
              >
            </div>
            <p v-if="c.lastMessage" class="truncate text-xs text-muted-foreground">
              <span v-if="c.lastMessage.fromMe" class="text-faint">School: </span
              >{{ c.lastMessage.body }}
            </p>
          </div>
        </RouterLink>
      </li>
    </ul>
  </SectionCard>

  <NewMessageDialog v-model:open="composing" />
</template>
