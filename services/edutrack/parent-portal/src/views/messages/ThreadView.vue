<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { ArrowLeftIcon, SendIcon } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useReplyMutation, useThreadQuery } from '@/api/services/messages';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage, isNotFound } from '@/lib/api-errors';
import { BODY_MAX, messageTime } from '@/lib/messages';
import { routesPath } from '@/router/routes-path';

/** One conversation: the messages as chat bubbles (yours on the right) and a reply box. */
const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));
const q = useThreadQuery(id);
const reply = useReplyMutation(id);
const thread = computed(() => q.data.value);

const draft = ref('');
const problem = ref('');
watch(id, () => {
  draft.value = '';
  problem.value = '';
});

// Keep the newest message in view as the thread loads and new ones arrive.
const end = ref<HTMLElement | null>(null);
watch(
  () => [id.value, thread.value?.messages.length],
  async () => {
    await nextTick();
    end.value?.scrollIntoView({ block: 'end' });
  },
  { immediate: true },
);

const tooLong = computed(() => draft.value.length > BODY_MAX);
async function send() {
  const body = draft.value.trim();
  if (!body || tooLong.value || reply.isPending.value) return;
  problem.value = '';
  try {
    await reply.mutateAsync(body);
    draft.value = '';
  } catch (err) {
    problem.value =
      fieldErrorsOf(err).body ?? getApiErrorMessage(err, 'Your message wasn’t sent. Try again.');
    if (errorCodeOf(err) === 'CONVERSATION_CLOSED') void q.refetch();
  }
}
</script>

<template>
  <RouterLink
    :to="{ name: routesPath.messages.list.name }"
    class="-my-1 flex items-center gap-1.5 self-start py-1 text-[13px] font-medium text-primary hover:underline"
    ><ArrowLeftIcon class="size-4" aria-hidden="true" /> All messages</RouterLink
  >
  <QueryState
    v-if="!thread && !isNotFound(q.error.value)"
    :loading="q.isPending.value"
    :error="q.error.value"
    :rows="1"
    @retry="q.refetch()"
  />
  <EmptyState
    v-else-if="!thread"
    title="Conversation not found"
    description="It may have been with another account, or the link is incomplete."
  >
    <Button as-child variant="outline" size="sm">
      <RouterLink :to="{ name: routesPath.messages.list.name }">All messages</RouterLink>
    </Button>
  </EmptyState>
  <template v-else>
    <PageTitle
      :title="thread.subject"
      :sub="[thread.with, thread.about && `About ${thread.about}`].filter(Boolean).join(' · ')"
    />

    <ol class="flex flex-col gap-3" aria-label="Messages">
      <li
        v-for="m in thread.messages"
        :key="m.id"
        class="flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]"
        :class="m.mine ? 'items-end self-end' : 'items-start self-start'"
      >
        <span
          class="rounded-2xl px-3.5 py-2.5 text-sm break-words whitespace-pre-line"
          :class="
            m.mine
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border bg-card'
          "
          >{{ m.body }}</span
        >
        <span class="px-1 text-[11px] text-faint"
          >{{ m.mine ? 'You' : m.from }} · {{ messageTime(m.at) }}</span
        >
      </li>
    </ol>
    <div ref="end" />

    <InlineNotice
      v-if="!thread.canReply"
      tone="neutral"
      title="This conversation is closed"
      :description="`${thread.with} has left the school. Write to the school office instead.`"
    >
      <template #action>
        <Button as-child variant="outline" size="sm">
          <RouterLink :to="{ name: routesPath.messages.create.name, query: { to: 'school' } }"
            >Write</RouterLink
          >
        </Button>
      </template>
    </InlineNotice>
    <form
      v-else
      class="sticky bottom-0 -mx-4 -mb-10 flex flex-col gap-1.5 border-t bg-background px-4 pt-2.5 pb-3"
      novalidate
      @submit.prevent="send"
    >
      <div class="flex items-end gap-2">
        <Textarea
          v-model="draft"
          :rows="1"
          placeholder="Write a reply"
          aria-label="Reply"
          :aria-invalid="tooLong || !!problem"
          class="max-h-40 min-h-11 flex-1 resize-none bg-card"
          @keydown.enter.exact.meta.prevent="send"
          @keydown.enter.exact.ctrl.prevent="send"
        />
        <Button
          type="submit"
          size="icon"
          class="size-11 shrink-0"
          :disabled="!draft.trim() || tooLong || reply.isPending.value"
          aria-label="Send"
        >
          <Spinner v-if="reply.isPending.value" />
          <SendIcon v-else />
        </Button>
      </div>
      <p v-if="tooLong" role="alert" class="text-[13px] text-error-strong">
        Keep the message to {{ BODY_MAX }} characters ({{ draft.length }} now).
      </p>
      <p v-else-if="problem" role="alert" class="text-[13px] text-error-strong">{{ problem }}</p>
      <p v-else class="text-[11px] text-faint">
        {{ thread.kind === 'School' ? 'The school office' : thread.with }} gets an email when you
        reply.
      </p>
    </form>
  </template>
</template>
