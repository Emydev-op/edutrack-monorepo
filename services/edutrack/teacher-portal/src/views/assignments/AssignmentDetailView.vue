<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { PencilIcon, RotateCcwIcon, Trash2Icon, XCircleIcon } from '@lucide/vue';
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useAssignmentActionMutation, useAssignmentQuery } from '@/api/services/assignments';
import { dueLabel, when } from '@/components/assignments/assignment-format';
import FileList from '@/components/assignments/FileList.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDeadline } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { SubmissionStatus } from '@/types';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const { now } = useTermContext();

const id = computed(() => String(route.params.assignmentId ?? ''));
const { data: a, isPending, error, refetch } = useAssignmentQuery(id);
const action = useAssignmentActionMutation();
watch(a, (x) => layout.setRecordLabel(x?.title ?? null), { immediate: true });

const subsTo = (status?: SubmissionStatus) => ({
  name: r.assignments.submissions.name,
  params: { assignmentId: id.value },
  query: status ? { status } : {},
});

const metrics = computed(() => {
  const x = a.value;
  if (!x || x.status === 'Draft') return [];
  const c = x.counts;
  return [
    { label: 'Students', value: x.students, hint: x.classLabel },
    {
      label: 'Submitted',
      value: x.submitted,
      hint: `${c.Submitted} waiting to be graded`,
      to: subsTo('Submitted'),
      tone: c.Submitted ? ('warning' as const) : undefined,
    },
    {
      label: 'Late',
      value: c.Late,
      hint: x.allowLate ? 'Waiting to be graded' : 'Late work isn’t allowed',
      to: subsTo('Late'),
      tone: c.Late ? ('warning' as const) : undefined,
    },
    {
      label: 'Not submitted',
      value: c['Not submitted'],
      hint: c.Excused ? `${c.Excused} excused` : undefined,
      to: subsTo('Not submitted'),
    },
    { label: 'Graded', value: c.Graded, hint: 'Private to you', to: subsTo('Graded') },
    {
      label: 'Returned',
      value: c.Returned,
      hint: 'Visible to students',
      to: subsTo('Returned'),
      tone: 'success' as const,
    },
  ];
});

const details = computed(() => {
  const x = a.value;
  if (!x) return [];
  const due = dueLabel(x.dueAt, now.value);
  return [
    { label: 'Class', value: `${x.classLabel} · ${x.branchName}` },
    { label: 'Due', value: x.dueAt ? `${due.text} (${due.hint})` : 'Not set yet' },
    { label: 'Max score', value: x.maxScore ?? 'Not set yet' },
    { label: 'Late work', value: x.allowLate ? 'Allowed, marked Late' : 'Not allowed' },
    { label: 'Published', value: x.publishedAt ? when(x.publishedAt) : 'Not yet (draft)' },
    ...(x.closedAt ? [{ label: 'Closed', value: when(x.closedAt) }] : []),
    { label: 'Last changed', value: when(x.updatedAt) },
  ];
});

async function closeNow() {
  const x = a.value!;
  await confirm({
    title: 'Close submissions now?',
    description: x.pastDue
      ? 'Students can’t hand in any more work, late or not.'
      : `It’s due ${formatDeadline(x.dueAt)}. Closing now stops students handing in before then.`,
    details: [
      ['Class', x.classLabel],
      ['Not handed in', `${x.counts['Not submitted']} students`],
      ['You can still', 'Grade and return work, or reopen it while the term is on'],
    ],
    confirmLabel: 'Close submissions',
    tone: 'destructive',
    action: async () => {
      await action.mutateAsync({ id: x.id, action: 'close' });
      toast.success('Submissions closed.');
    },
  });
}

async function reopen() {
  const x = a.value!;
  await confirm({
    title: 'Reopen submissions?',
    description: x.pastDue
      ? 'The due date has passed, so late work is allowed and new work is marked Late.'
      : 'Students can hand in work again until the due time.',
    details: [
      ['Class', x.classLabel],
      ['Notifies', `${x.students} students and their guardians`],
    ],
    confirmLabel: 'Reopen',
    action: async () => {
      await action.mutateAsync({ id: x.id, action: 'reopen' });
      toast.success('Submissions reopened.');
    },
  });
}

async function remove() {
  const x = a.value!;
  const ok = await confirm({
    title: 'Delete this draft?',
    description: 'Students never saw it. This can’t be undone.',
    details: [
      ['Title', x.title],
      ['Class', x.classLabel],
    ],
    confirmLabel: 'Delete draft',
    tone: 'destructive',
    action: () => action.mutateAsync({ id: x.id, action: 'delete' }),
  });
  if (!ok) return;
  toast.success('Draft deleted.');
  await router.push({ name: r.assignments.list.name });
}
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="this assignment"
    :reason="getApiErrorMessage(error)"
  />
  <EmptyState
    v-else-if="isNotFound(error)"
    title="Assignment not found"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.assignments.list.name }">Back to assignments</RouterLink></Button
    >
  </EmptyState>
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The assignment couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>
  <template v-else-if="isPending || !a">
    <Skeleton class="h-16 w-full" />
    <Skeleton class="h-24 w-full" />
    <Skeleton class="h-72 w-full" />
  </template>
  <template v-else>
    <PageHeader
      :title="a.title"
      :status="a.status"
      :description="`${a.classLabel} · ${a.branchName}`"
      :meta="[
        { label: 'Due', value: a.dueAt ? formatDeadline(a.dueAt) : 'Not set' },
        { label: 'Max', value: a.maxScore ? String(a.maxScore) : '—' },
        ...(a.allowLate ? [{ label: 'Late', value: 'allowed' }] : []),
      ]"
    >
      <template #actions>
        <Button v-if="a.status !== 'Draft'" as-child>
          <RouterLink :to="subsTo()">
            Submissions<span v-if="a.toGrade" class="rounded-sm bg-white/20 px-1.5 text-xs"
              >{{ a.toGrade }} to grade</span
            >
          </RouterLink>
        </Button>
        <Button
          v-if="a.permissions.edit"
          as-child
          :variant="a.status === 'Draft' ? 'default' : 'outline'"
        >
          <RouterLink :to="{ name: r.assignments.edit.name, params: { assignmentId: a.id } }">
            <PencilIcon class="size-4" /> {{ a.status === 'Draft' ? 'Edit and publish' : 'Edit' }}
          </RouterLink>
        </Button>
        <Button v-if="a.permissions.close" variant="outline" @click="closeNow">
          <XCircleIcon class="size-4" /> Close submissions now
        </Button>
        <Button v-if="a.permissions.reopen" variant="outline" @click="reopen">
          <RotateCcwIcon class="size-4" /> Reopen
        </Button>
        <Button
          v-if="a.permissions.delete"
          variant="outline"
          class="text-destructive"
          @click="remove"
        >
          <Trash2Icon class="size-4" /> Delete draft
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="a.permissions.lockReason"
      tone="info"
      title="Read-only"
      :description="a.permissions.lockReason"
    />
    <InlineNotice
      v-else-if="a.status === 'Draft'"
      tone="info"
      title="Draft · students can’t see it yet"
      description="Edit it to add anything missing, then publish. Publishing notifies the class and their guardians."
    />
    <InlineNotice
      v-else-if="a.status === 'Closed'"
      tone="neutral"
      title="Submissions are closed"
      :description="
        a.permissions.reopen
          ? 'You can still grade and return work. Reopen it to let students hand in again.'
          : 'You can still grade and return work.'
      "
    />

    <MetricGrid v-if="metrics.length">
      <MetricCard
        v-for="m in metrics"
        :key="m.label"
        :label="m.label"
        :value="m.value"
        :hint="m.hint"
        :to="m.to"
        :hint-tone="m.tone"
      />
    </MetricGrid>

    <div class="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard title="Instructions">
          <p v-if="a.instructions" class="text-[13px] whitespace-pre-line text-pretty">
            {{ a.instructions }}
          </p>
          <p v-else class="text-[13px] text-muted-foreground">No instructions yet.</p>
        </SectionCard>
        <SectionCard title="Attachments">
          <FileList :files="a.attachments" />
          <p
            v-if="a.attachments.some((f) => f.unavailable)"
            class="mt-2 text-xs text-warning-strong"
          >
            Students see archived materials as unavailable. Restore the material or remove it from
            the assignment.
          </p>
        </SectionCard>
      </div>
      <div class="flex min-w-0 flex-col gap-4">
        <KeyValueCard title="Details" :rows="details" />
        <SectionCard>
          <ActivityTimeline :items="a.history" title="History" />
        </SectionCard>
      </div>
    </div>
  </template>
</template>
