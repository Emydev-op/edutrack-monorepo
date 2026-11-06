<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { ArrowRightIcon, InfoIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import { useIssueMessageMutation, useIssueQuery } from '@/api/services/support';
import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import { hoursText } from '@/config/support-desk';
import { initials } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import { ISSUE_PRIORITY_TONE, ISSUE_STATUS_TONE } from './components/issue-tones';
import { issueBanner, issueStages } from './components/issue-stages';
import { useIssueActions } from './components/useIssueActions';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: issue, isPending, isError } = useIssueQuery(id);
const sendMessage = useIssueMessageMutation(id);
const { actionsFor } = useIssueActions();
const layout = useLayoutStore();
watch(issue, (i) => layout.setRecordLabel(i?.id ?? null), { immediate: true });

const mode = ref<'agent' | 'note'>('agent');
const draft = ref('');
const draftError = ref('');
const requesterName = computed(() => issue.value?.requester.split(' · ')[0] ?? 'the school');
/** A first reply on an unowned ticket picks it up. */
const picksUp = computed(
  () => mode.value === 'agent' && ['Open', 'Reopened'].includes(issue.value?.status ?? ''),
);

async function send() {
  if (!draft.value.trim()) return void (draftError.value = 'Write something first');
  await sendMessage.mutateAsync({ kind: mode.value, text: draft.value.trim() });
  toast.success(mode.value === 'note' ? 'Internal note added.' : 'Reply sent to the school.');
  draft.value = '';
}
watch(draft, () => (draftError.value = ''));

const stages = computed(() => (issue.value ? issueStages(issue.value) : []));
const banner = computed(() => (issue.value ? issueBanner(issue.value) : ''));
const actions = computed(() => (issue.value ? actionsFor(issue.value) : []));

const properties = computed(() => {
  const i = issue.value;
  if (!i) return [];
  const [reply, resolve] = i.sla.targets;
  return [
    ['Requester', i.requester],
    ['Owner', i.assignee ?? 'Unassigned'],
    ['Team', i.team],
    ['Category', i.category],
    ['Priority', `${i.priority} · reply ${hoursText(reply)}, resolve ${hoursText(resolve)}`],
    ['First reply SLA', i.sla.firstReply.label],
    ['Resolution SLA', i.sla.resolution.label],
    ...(i.escalatedTo ? [['Escalated to', i.escalatedTo]] : []),
    ...(i.holdReason ? [['On hold for', i.holdReason]] : []),
    ...(i.reopenCount ? [['Reopened', `${i.reopenCount}×`]] : []),
    ...(i.rating
      ? [
          [
            'Satisfaction',
            `${i.rating.score} / 5${i.rating.comment ? ` · ${i.rating.comment}` : ''}`,
          ],
        ]
      : []),
    ['Created', i.createdAt],
    ['Updated', i.updatedAt],
  ] as [string, string][];
});

const MESSAGE_STYLE = {
  school: { bubble: 'bg-card', avatar: 'bg-info-subtle text-info-strong' },
  agent: { bubble: 'bg-muted', avatar: 'bg-brand-subtle text-brand-strong' },
  note: { bubble: 'border-[#F0D9AE] bg-[#FDF3E3]', avatar: 'bg-brand-subtle text-brand-strong' },
};
const messageLabel = (kind: 'school' | 'agent' | 'note', role: string) =>
  kind === 'note'
    ? 'Internal note · only platform users can see this'
    : kind === 'school'
      ? role
      : 'Reply · visible to the school';
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-2/3" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !issue"
    title="Ticket not found"
    description="It may have been merged or the link is incomplete."
    illustrated
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.support.list.name }">Back to support</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <div class="flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="text-[13px] font-medium text-muted-foreground">#{{ issue.id }}</span>
        <StatusBadge :label="issue.priority" :tone="ISSUE_PRIORITY_TONE[issue.priority]" />
        <StatusBadge :label="issue.status" :tone="ISSUE_STATUS_TONE[issue.status]" />
      </div>
      <h1 class="text-2xl leading-tight font-semibold">{{ issue.subject }}</h1>
    </div>

    <ol aria-label="Ticket lifecycle" class="flex flex-wrap items-center gap-1.5 text-xs">
      <li
        v-for="(step, i) in stages"
        :key="step.label"
        class="flex items-center gap-1.5"
        :aria-current="step.state === 'current' ? 'step' : undefined"
      >
        <span
          :class="
            cn(
              'rounded-sm border px-2.5 py-0.75 font-medium whitespace-nowrap',
              step.state === 'current' && 'border-primary bg-primary text-white',
              step.state === 'done' && 'border-[#CFE5D9] bg-success-subtle text-success-strong',
              step.state === 'todo' && 'bg-card text-faint',
            )
          "
        >
          {{ step.label }}
        </span>
        <ArrowRightIcon v-if="i < stages.length - 1" class="size-3 text-[#B8B2A9]" />
      </li>
    </ol>

    <p
      v-if="banner"
      role="status"
      class="flex items-start gap-2.5 rounded-lg border border-[#D9D5CD] bg-neutral-subtle px-3.5 py-3 text-[13px] text-body"
    >
      <InfoIcon class="mt-px size-4 shrink-0 text-neutral-strong" aria-hidden="true" />{{ banner }}
    </p>

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div class="flex flex-col gap-3">
        <p v-if="issue.resolution" class="rounded-md bg-success-subtle px-3.5 py-3 text-[13px]">
          <b class="font-semibold text-success-strong">Resolution:</b> {{ issue.resolution }}
        </p>
        <article v-for="m in issue.messages" :key="m.id" class="grid grid-cols-[36px_1fr] gap-3">
          <span
            :class="
              cn(
                'flex size-9 items-center justify-center rounded-full text-xs font-semibold',
                MESSAGE_STYLE[m.kind].avatar,
              )
            "
            >{{ initials(m.author) }}</span
          >
          <div
            :class="
              cn(
                'flex flex-col gap-1.5 rounded-lg border px-3.5 py-3',
                MESSAGE_STYLE[m.kind].bubble,
              )
            "
          >
            <div class="flex flex-wrap justify-between gap-2.5">
              <span class="text-[13px]"
                ><b class="font-semibold">{{ m.author }}</b>
                <span class="text-muted-foreground"
                  >· {{ messageLabel(m.kind, m.authorRole) }}</span
                ></span
              >
              <span class="text-xs text-faint">{{ m.when }}</span>
            </div>
            <p class="text-sm leading-relaxed text-pretty whitespace-pre-line">{{ m.text }}</p>
          </div>
        </article>

        <p
          v-if="issue.status === 'Closed'"
          class="rounded-md bg-neutral-subtle px-3.5 py-3 text-[13px] text-neutral-strong"
        >
          This ticket is closed. Reopen it to reply.
        </p>
        <form
          v-else
          :class="
            cn(
              'flex flex-col rounded-lg border',
              mode === 'note' ? 'border-[#F0D9AE] bg-[#FDF3E3]' : 'bg-card',
            )
          "
          @submit.prevent="send"
        >
          <div
            role="tablist"
            class="flex gap-4.5 border-b border-inherit px-3.5"
            :class="mode === 'note' && 'border-[#F0D9AE]'"
          >
            <button
              v-for="[value, label] in [
                ['agent', 'Reply to school'],
                ['note', 'Internal note'],
              ] as const"
              :key="value"
              type="button"
              role="tab"
              :aria-selected="mode === value"
              :class="
                cn(
                  '-mb-px border-b-2 py-2.5 text-[13px]',
                  mode === value
                    ? 'font-medium text-foreground'
                    : 'border-transparent text-muted-foreground',
                  mode === value && (value === 'note' ? 'border-warning' : 'border-primary'),
                )
              "
              @click="mode = value"
            >
              {{ label }}
            </button>
          </div>
          <Textarea
            v-model="draft"
            aria-label="Message"
            rows="4"
            :placeholder="
              mode === 'note'
                ? 'Add a note for the support team. The school won\'t see this.'
                : `Write a reply to ${requesterName}…`
            "
            class="min-h-24 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div
            class="flex items-center gap-2.5 border-t px-3.5 py-2.5"
            :class="mode === 'note' && 'border-[#F0D9AE]'"
          >
            <span v-if="draftError" role="alert" class="text-xs text-destructive">{{
              draftError
            }}</span>
            <span v-else-if="picksUp" class="text-xs text-muted-foreground"
              >Sending a reply assigns it to {{ issue.assignee ?? 'you' }} and starts work.</span
            >
            <Button type="submit" class="ml-auto" :disabled="sendMessage.isPending.value">
              <Spinner v-if="sendMessage.isPending.value" />
              {{
                sendMessage.isPending.value
                  ? 'Sending…'
                  : mode === 'note'
                    ? 'Add internal note'
                    : 'Send reply'
              }}
            </Button>
          </div>
        </form>
      </div>

      <aside class="sticky top-0 flex flex-col gap-3">
        <div v-if="actions.length" class="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
          <Button
            v-for="a in actions"
            :key="a.label"
            :variant="a.primary ? 'default' : 'outline'"
            @click="a.run()"
            >{{ a.label }}</Button
          >
        </div>
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3.5 text-[13px]"
        >
          <dt class="text-faint">School</dt>
          <dd>
            <RouterLink
              :to="{ name: routesPath.schools.detail.name, params: { id: issue.schoolId } }"
              class="font-medium text-primary hover:underline"
              >{{ issue.schoolName }}</RouterLink
            >
          </dd>
          <template v-for="[label, value] in properties" :key="label">
            <dt class="text-faint">{{ label }}</dt>
            <dd class="min-w-0 break-words">{{ value }}</dd>
          </template>
        </dl>
      </aside>
    </div>

    <ActivityTimeline title="Ticket activity" :items="issue.events" />
  </template>
</template>
