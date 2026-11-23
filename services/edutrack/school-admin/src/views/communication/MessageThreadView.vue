<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { SendIcon } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { isForbidden, useMessageThreadQuery, useReplyMutation } from '@/api/services/messages';
import { routesPath } from '@/router/routes-path';

import { fmtCount, fmtMessageTime } from './comms-tones';

/**
 * One conversation with a parent. The school's messages sit on the right, each saying which
 * colleague wrote it; the parent's on the left. Emails to the office link straight here.
 */
const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: thread, isPending, error } = useMessageThreadQuery(id);
const reply = useReplyMutation();

const body = ref('');
const replyError = ref('');
watch(body, () => (replyError.value = ''));
watch(id, () => {
  body.value = '';
  replyError.value = '';
});

const forbidden = computed(() => isForbidden(error.value));
const description = computed(() => {
  const t = thread.value;
  if (!t) return '';
  return [`With ${t.with}`, t.about && `About ${t.about}`].filter(Boolean).join(' · ');
});

// Keep the newest message in view when the thread opens and when new ones arrive.
const scroller = ref<HTMLElement | null>(null);
watch(
  () => thread.value?.messages.length,
  async (n, prev) => {
    if (!n || n === prev) return;
    await nextTick();
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
  },
  { immediate: true },
);

async function send() {
  const text = body.value.trim();
  if (!text) {
    replyError.value = 'Write your reply first.';
    return;
  }
  try {
    await reply.mutateAsync({ id: id.value, body: text });
    body.value = '';
  } catch (e) {
    const fields = getApiErrorFields(e);
    if (fields.body) replyError.value = fields.body;
    else toast.error(getApiErrorMessage(e, 'Your reply didn’t send. Try again.'));
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void send();
  }
}
</script>

<template>
  <template v-if="forbidden">
    <PageHeader title="Message" />
    <InlineNotice
      tone="warning"
      title="Only staff with school-wide messaging can read the school’s messages"
      description="Ask an administrator to give your role Communication · School in Users & Roles."
    />
  </template>

  <EmptyState
    v-else-if="error"
    title="Conversation not found"
    description="It may belong to a teacher, or the link is wrong."
  >
    <Button as-child variant="outline">
      <RouterLink :to="{ name: routesPath.communication.messages.name }"
        >Back to messages</RouterLink
      >
    </Button>
  </EmptyState>

  <template v-else-if="isPending || !thread">
    <Skeleton class="h-7 w-64" />
    <Skeleton class="h-80 w-full" />
  </template>

  <template v-else>
    <PageHeader :title="thread.subject" :description="description">
      <template #actions>
        <Button as-child variant="outline">
          <RouterLink :to="{ name: routesPath.communication.messages.name }"
            >All messages</RouterLink
          >
        </Button>
      </template>
    </PageHeader>

    <SectionCard flush class="flex flex-col overflow-hidden">
      <div
        ref="scroller"
        class="flex max-h-[min(60vh,640px)] min-h-48 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-4"
        aria-label="Messages"
        role="log"
      >
        <p v-if="!thread.messages.length" class="py-8 text-center text-sm text-muted-foreground">
          No messages in this conversation yet.
        </p>
        <div
          v-for="m in thread.messages"
          :key="m.id"
          :class="cn('flex flex-col gap-1', m.mine ? 'items-end' : 'items-start')"
        >
          <span class="px-1 text-xs text-muted-foreground">
            <span class="font-medium text-body">{{ m.from }}</span>
            · <time :datetime="m.at" class="tabular-nums">{{ fmtMessageTime(m.at) }}</time>
          </span>
          <div
            :class="
              cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words sm:max-w-[70%]',
                m.mine
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted text-foreground',
              )
            "
          >
            {{ m.body }}
          </div>
        </div>
      </div>

      <div class="border-t border-divider p-3 sm:p-4">
        <InlineNotice
          v-if="!thread.canReply"
          tone="neutral"
          title="This conversation is closed"
          description="Replies can’t be added any more. Start a new message to the parent if you need to."
        />
        <form v-else class="flex flex-col gap-2" @submit.prevent="send">
          <label for="mt-reply" class="sr-only">Reply to {{ thread.with }}</label>
          <Textarea
            id="mt-reply"
            v-model="body"
            rows="3"
            maxlength="2000"
            :placeholder="`Reply to ${thread.with}`"
            :aria-invalid="!!replyError || undefined"
            @keydown="onKeydown"
          />
          <div class="flex items-center justify-between gap-3">
            <span :class="cn('text-xs', replyError ? 'text-error-strong' : 'text-faint')">
              {{
                replyError ||
                `${fmtCount(body.length)} of 2,000 · the parent gets an email. Ctrl + Enter sends.`
              }}
            </span>
            <Button type="submit" :disabled="reply.isPending.value">
              <Spinner v-if="reply.isPending.value" />
              <SendIcon v-else />
              Send
            </Button>
          </div>
        </form>
      </div>
    </SectionCard>
  </template>
</template>
