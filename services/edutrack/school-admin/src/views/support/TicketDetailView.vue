<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { FileTextIcon, ImageIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useCloseTicketMutation,
  useConfirmTicketMutation,
  useReopenTicketMutation,
  useReplyTicketMutation,
  useTicketQuery,
} from '@/api/services/support';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import { TICKET_LIMITS, type TicketAttachment, type TicketDetail } from '@/types';

import AttachmentPicker from './AttachmentPicker.vue';
import { fileSize, fmtWhen, SLA_TONE } from './support-format';

const route = useRoute();
const layout = useLayoutStore();
const confirm = useConfirm();
const id = computed(() => String(route.params.id ?? ''));
const { data: t, isPending, error } = useTicketQuery(id);

const reply = useReplyTicketMutation();
const confirmFix = useConfirmTicketMutation();
const reopen = useReopenTicketMutation();
const close = useCloseTicketMutation();

watch(t, (x) => layout.setRecordLabel(x ? x.id : null), { immediate: true });

const notFound = computed(
  () =>
    !!error.value && (error.value as { response?: { status?: number } }).response?.status === 404,
);

/* ---------------- What the school should do next ---------------- */

const notice = computed(() => {
  const x = t.value;
  if (!x) return null;
  switch (x.status) {
    case 'Waiting for School':
      return {
        tone: 'warning' as const,
        title: 'Support is waiting for your reply',
        description: 'Answer their question below. The ticket goes back to support when you reply.',
      };
    case 'Resolved':
      return {
        tone: 'success' as const,
        title: 'Support marked this resolved',
        description: `Check it’s fixed, then confirm. If it isn’t, reopen it. It closes by itself on ${fmtWhen(x.autoCloseAt)} if there’s no answer.`,
      };
    case 'Closed':
      return {
        tone: 'neutral' as const,
        title: 'This ticket is closed',
        description:
          'Closed tickets can’t take replies. If the problem is back, open a follow-up and support will see this conversation.',
      };
    case 'Open':
      return {
        tone: 'info' as const,
        title: x.assignee ? `With ${x.assignee}` : `Waiting in the ${x.team} queue`,
        description: x.sla.label,
      };
    default:
      return {
        tone: 'info' as const,
        title: `${x.assignee ?? 'Support'} is working on it`,
        description: 'You’ll get a notification when there’s an update.',
      };
  }
});

const details = computed(() => {
  const x = t.value;
  if (!x) return [];
  return [
    { label: 'Ticket', value: x.id },
    { label: 'Category', value: x.category },
    {
      label: 'Priority',
      value: x.priority,
      emphasis: x.priority === 'Normal' ? undefined : ('error' as const),
    },
    { label: 'Raised by', value: x.requester },
    { label: 'Created', value: fmtWhen(x.createdAt) },
    { label: 'Handled by', value: x.assignee ?? 'Not yet assigned' },
    { label: 'Team', value: x.team },
    {
      label: 'First reply',
      value: x.sla.label,
      emphasis:
        x.sla.state === 'over'
          ? ('error' as const)
          : x.sla.state === 'met'
            ? ('success' as const)
            : undefined,
    },
    ...(x.resolution ? [{ label: 'Resolution', value: x.resolution }] : []),
    ...(x.rating ? [{ label: 'Your rating', value: `${x.rating} of 5` }] : []),
    ...(x.reopenCount ? [{ label: 'Reopened', value: `${x.reopenCount}×` }] : []),
  ];
});

const timeline = computed(() =>
  (t.value?.events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    detail: e.detail,
    tone: e.tone,
    when: fmtWhen(e.at),
  })),
);

/* ---------------- Reply ---------------- */

const replyText = ref('');
const replyFiles = ref<TicketAttachment[]>([]);
const replyError = ref('');
watch(id, () => {
  replyText.value = '';
  replyFiles.value = [];
  replyError.value = '';
});
useUnsavedChanges(() => !!replyText.value.trim() || replyFiles.value.length > 0);

async function sendReply() {
  const x = t.value;
  if (!x) return;
  replyError.value = '';
  const text = replyText.value.trim();
  if (!text) return void (replyError.value = 'Write a message first.');
  if (text.length > TICKET_LIMITS.text)
    return void (replyError.value = `Keep the message to ${TICKET_LIMITS.text} characters.`);
  try {
    await reply.mutateAsync({ id: x.id, text, attachments: replyFiles.value });
    replyText.value = '';
    replyFiles.value = [];
    toast.success('Reply sent to the support team.');
  } catch (e) {
    replyError.value = getApiErrorMessage(e);
  }
}

/* ---------------- Status actions ---------------- */

function doConfirm(x: TicketDetail) {
  void confirm({
    title: `Confirm ${x.id} is fixed?`,
    description: 'The ticket closes. If the problem comes back, you can open a follow-up.',
    options: [
      { value: '5', label: '5 · Excellent' },
      { value: '4', label: '4 · Good' },
      { value: '3', label: '3 · Okay' },
      { value: '2', label: '2 · Poor' },
      { value: '1', label: '1 · Very poor' },
      { value: '', label: 'Skip rating' },
    ],
    defaultOption: '5',
    confirmLabel: 'Confirm and close',
    action: async ({ option }) => {
      await confirmFix.mutateAsync({ id: x.id, rating: option ? Number(option) : null });
      toast.success(`${x.id} closed. Thanks for confirming.`);
    },
  });
}

function doReopen(x: TicketDetail) {
  void confirm({
    title: `Reopen ${x.id}?`,
    description: 'It goes back to support with your note.',
    input: {
      label: 'What still isn’t working?',
      placeholder: 'e.g. Receipts for Lekki Campus still show the Main Campus address',
      required: true,
    },
    confirmLabel: 'Reopen ticket',
    action: async ({ text }) => {
      await reopen.mutateAsync({ id: x.id, reason: text });
      toast.success(`${x.id} reopened.`);
    },
  });
}

function doClose(x: TicketDetail) {
  void confirm({
    title: `Close ${x.id}?`,
    description:
      'Support stops working on it. Closed tickets can’t be reopened, but you can open a follow-up.',
    input: {
      label: 'Why are you closing it?',
      placeholder: 'e.g. Sorted it out ourselves',
      required: true,
    },
    confirmLabel: 'Close ticket',
    tone: 'destructive',
    action: async ({ text }) => {
      await close.mutateAsync({ id: x.id, reason: text });
      toast.success(`${x.id} closed.`);
    },
  });
}

const followUpLink = computed(() => {
  const x = t.value;
  if (!x) return null;
  return {
    name: routesPath.supportNew.name,
    query: {
      followUp: x.id,
      category: x.category,
      priority: x.priority,
      subject: `Follow-up: ${x.subject}`.slice(0, TICKET_LIMITS.subject),
    },
  };
});
</script>

<template>
  <EmptyState
    v-if="error"
    :title="notFound ? 'Ticket not found' : 'We couldn’t load this ticket'"
    :description="
      notFound
        ? 'This ticket doesn’t exist or isn’t for your school.'
        : 'Check your connection and try again.'
    "
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.support.name }">Back to support</RouterLink></Button
    >
  </EmptyState>
  <p v-else-if="isPending || !t" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader
      :title="t.subject"
      :description="`${t.id} · ${t.category} · ${t.priority} priority`"
      :status="t.status"
    >
      <template #actions>
        <Button v-if="t.can.close" variant="outline" @click="doClose(t)">Close ticket</Button>
        <Button v-if="t.can.reopen" variant="outline" @click="doReopen(t)">Reopen</Button>
        <Button v-if="t.can.confirm" @click="doConfirm(t)">Confirm it’s fixed</Button>
        <Button v-if="t.can.followUp && followUpLink" as-child
          ><RouterLink :to="followUpLink">Open a follow-up</RouterLink></Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.description"
    />

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <SectionCard title="Conversation">
          <ol class="flex flex-col gap-3">
            <li
              v-for="m in t.messages"
              :key="m.id"
              :class="
                cn(
                  'flex flex-col gap-1.5 rounded-lg border px-3.5 py-3 text-[13px]',
                  m.from === 'school' ? 'bg-surface-warm' : 'border-info-subtle bg-card',
                )
              "
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <span class="font-medium"
                  >{{ m.author }}
                  <span class="font-normal text-faint">· {{ m.authorRole }}</span></span
                >
                <span class="text-xs text-faint">{{ fmtWhen(m.at) }}</span>
              </div>
              <p class="break-words whitespace-pre-line">{{ m.text }}</p>
              <ul v-if="m.attachments.length" class="flex flex-wrap gap-2">
                <li v-for="a in m.attachments" :key="a.name">
                  <component
                    :is="a.dataUrl ? 'a' : 'span'"
                    :href="a.dataUrl ?? undefined"
                    :download="a.dataUrl ? a.name : undefined"
                    :class="
                      cn(
                        'inline-flex max-w-[260px] items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs',
                        a.dataUrl && 'hover:bg-surface-warm',
                      )
                    "
                    :title="a.dataUrl ? `Download ${a.name}` : 'Stored with the ticket'"
                  >
                    <ImageIcon v-if="a.type.startsWith('image/')" class="size-3.5 shrink-0" />
                    <FileTextIcon v-else class="size-3.5 shrink-0" />
                    <span class="truncate">{{ a.name }}</span>
                    <span class="text-faint">{{ fileSize(a.bytes) }}</span>
                  </component>
                </li>
              </ul>
            </li>
          </ol>
        </SectionCard>

        <SectionCard
          v-if="t.can.reply"
          title="Reply"
          description="Support sees your reply straight away."
        >
          <form class="flex flex-col gap-3" novalidate @submit.prevent="sendReply">
            <label for="ticket-reply" class="sr-only">Message to support</label>
            <Textarea
              id="ticket-reply"
              v-model="replyText"
              :rows="4"
              placeholder="Add details or answer support’s question"
              :aria-invalid="!!replyError"
              :disabled="reply.isPending.value"
            />
            <AttachmentPicker v-model="replyFiles" :disabled="reply.isPending.value" />
            <p v-if="replyError" role="alert" class="text-xs text-destructive">{{ replyError }}</p>
            <div>
              <Button type="submit" :disabled="reply.isPending.value">{{
                reply.isPending.value ? 'Sending…' : 'Send reply'
              }}</Button>
            </div>
          </form>
        </SectionCard>
      </div>

      <div class="flex flex-col gap-4">
        <KeyValueCard title="Details" :rows="details" />
        <p
          v-if="t.status === 'Open' || t.sla.state === 'over'"
          :class="cn('-mt-2 px-1 text-xs', SLA_TONE[t.sla.state])"
        >
          Target: first reply within {{ t.sla.targetHours }} working hour{{
            t.sla.targetHours === 1 ? '' : 's'
          }}
          for {{ t.priority.toLowerCase() }} priority.
        </p>
        <SectionCard v-if="t.followUpOf || t.followUps.length" title="Related tickets">
          <ul class="flex flex-col gap-1.5 text-[13px]">
            <li v-if="t.followUpOf">
              Follows up
              <RouterLink
                class="font-medium text-primary hover:underline"
                :to="{ name: routesPath.supportTicket.name, params: { id: t.followUpOf } }"
                >{{ t.followUpOf }}</RouterLink
              >
            </li>
            <li v-for="f in t.followUps" :key="f">
              Followed up in
              <RouterLink
                class="font-medium text-primary hover:underline"
                :to="{ name: routesPath.supportTicket.name, params: { id: f } }"
                >{{ f }}</RouterLink
              >
            </li>
          </ul>
        </SectionCard>
        <ActivityTimeline title="Status updates" :items="timeline" />
      </div>
    </div>
  </template>
</template>
