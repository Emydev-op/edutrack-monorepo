<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorCode, getApiErrorFields } from '@edutrack/web-core/http';
import { SendIcon } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useConversationQuery, useReplyMutation } from '@/api/services/messages';
import { getApiErrorMessage, isForbidden, isNotFound, statusOf } from '@/lib/api-errors';
import { formatMessageTime } from '@/lib/relative-time';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import { MESSAGE_LIMITS } from '@/types';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data, isPending, error } = useConversationQuery(id);
const reply = useReplyMutation(id);

watch(data, (t) => layout.setRecordLabel(t?.subject ?? null), { immediate: true });

const body = ref('');
const replyError = ref('');
const closed = ref(false);
const canReply = computed(() => Boolean(data.value?.canReply) && !closed.value);
const tooLong = computed(() => body.value.length > MESSAGE_LIMITS.body);

// Keep the newest message in view when the thread opens or grows.
const list = ref<HTMLElement | null>(null);
watch(
  () => data.value?.messages.length,
  async (n, before) => {
    if (!n || n === before) return;
    await nextTick();
    list.value?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  },
  { immediate: true },
);

async function send() {
  const text = body.value.trim();
  replyError.value = '';
  if (!text) return void (replyError.value = 'Write a message first.');
  if (tooLong.value)
    return void (replyError.value = `Keep it to ${MESSAGE_LIMITS.body} characters.`);
  try {
    await reply.mutateAsync(text);
    body.value = '';
  } catch (e) {
    if (getApiErrorCode(e) === 'CONVERSATION_CLOSED' || statusOf(e) === 409) closed.value = true;
    replyError.value =
      getApiErrorFields(e).body ?? getApiErrorMessage(e, 'Your reply wasn’t sent. Try again.');
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void send();
  }
};
</script>

<template>
  <template v-if="isPending">
    <Skeleton class="h-9 w-2/3" />
    <Skeleton class="h-80 w-full max-w-3xl" />
  </template>
  <EmptyState
    v-else-if="error"
    :title="
      isNotFound(error) || isForbidden(error)
        ? 'Conversation not found'
        : 'This conversation couldn’t load'
    "
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.messages.list.name }">All messages</RouterLink></Button
    >
  </EmptyState>
  <template v-else-if="data">
    <PageHeader
      :title="data.subject"
      :meta="[
        { label: 'With', value: data.with },
        ...(data.about ? [{ label: 'About', value: data.about }] : []),
      ]"
    />

    <div class="flex max-w-3xl flex-col rounded-lg border bg-card">
      <ol
        ref="list"
        class="flex flex-col gap-3 px-4 py-4 max-sm:px-3"
        aria-label="Messages"
        aria-live="polite"
      >
        <li
          v-for="m in data.messages"
          :key="m.id"
          :class="cn('flex flex-col gap-1', m.mine ? 'items-end' : 'items-start')"
        >
          <span class="px-1 text-xs text-faint"
            >{{ m.mine ? 'You' : m.from }} ·
            <time :datetime="m.at" :title="new Date(m.at).toLocaleString()">{{
              formatMessageTime(m.at)
            }}</time></span
          >
          <p
            :class="
              cn(
                'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-w-[75%]',
                m.mine
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted text-foreground',
              )
            "
          >
            {{ m.body }}
          </p>
        </li>
      </ol>

      <div class="border-t px-4 py-3 max-sm:px-3">
        <InlineNotice
          v-if="!canReply"
          tone="neutral"
          title="Replies are closed"
          description="This conversation is read-only: you can no longer reply to it from your workspace."
        />
        <form v-else class="flex flex-col gap-2" novalidate @submit.prevent="send">
          <label for="reply" class="sr-only">Your reply</label>
          <Textarea
            id="reply"
            v-model="body"
            :rows="3"
            placeholder="Write a reply…"
            :aria-invalid="Boolean(replyError) || tooLong"
            :aria-describedby="replyError ? 'reply-error' : undefined"
            @keydown="onKeydown"
          />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span
              v-if="replyError"
              id="reply-error"
              role="alert"
              class="text-xs text-error-strong"
              >{{ replyError }}</span
            >
            <span v-else :class="cn('text-xs', tooLong ? 'text-error-strong' : 'text-faint')"
              >{{ body.length }} / {{ MESSAGE_LIMITS.body }}</span
            >
            <Button type="submit" :disabled="reply.isPending.value || !body.trim()">
              <Spinner v-if="reply.isPending.value" /><SendIcon v-else class="size-4" /> Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  </template>
</template>
