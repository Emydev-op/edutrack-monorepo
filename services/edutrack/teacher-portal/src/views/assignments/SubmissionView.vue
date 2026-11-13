<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { computed, ref, useId, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useSubmissionMutation, useSubmissionQuery } from '@/api/services/assignments';
import { durationText, when } from '@/components/assignments/assignment-format';
import FileList from '@/components/assignments/FileList.vue';
import SubmissionStatusBadge from '@/components/assignments/SubmissionStatusBadge.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDeadline } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const confirm = useConfirm();
const layout = useLayoutStore();
const uid = useId();

const assignmentId = computed(() => String(route.params.assignmentId ?? ''));
const submissionId = computed(() => String(route.params.submissionId ?? ''));
const { data: s, isPending, error, refetch } = useSubmissionQuery(assignmentId, submissionId);
const mutate = useSubmissionMutation();
watch(s, (x) => layout.setRecordLabel(x?.studentName ?? null), { immediate: true });

const a = computed(() => s.value?.assignment);
const max = computed(() => a.value?.maxScore ?? 100);
const score = ref('');
const feedback = ref('');
const excuseReason = ref('');
const errors = ref<{ score?: string; reason?: string; form?: string }>({});

// Reset the form when the record (or the student) changes.
watch(
  () => [s.value?.id, s.value?.status, s.value?.score, s.value?.feedback] as const,
  () => {
    score.value =
      s.value?.score === null || s.value?.score === undefined ? '' : String(s.value.score);
    feedback.value = s.value?.feedback ?? '';
    excuseReason.value = '';
    errors.value = {};
  },
  { immediate: true },
);
watch(score, () => errors.value.score && (errors.value = { ...errors.value, score: undefined }));
watch(
  excuseReason,
  () => errors.value.reason && (errors.value = { ...errors.value, reason: undefined }),
);
const dirty = computed(
  () =>
    !!s.value &&
    (score.value !== (s.value.score === null ? '' : String(s.value.score)) ||
      feedback.value !== s.value.feedback ||
      Boolean(excuseReason.value.trim())),
);
useUnsavedWork(dirty, () => `Grade · ${s.value?.studentName ?? 'submission'}`);

const lockReason = computed(() => a.value?.permissions.lockReason ?? null);
const handedIn = computed(() =>
  s.value ? ['Submitted', 'Late', 'Graded', 'Returned'].includes(s.value.status) : false,
);
const canGrade = computed(() => !lockReason.value && handedIn.value);

function parsedScore(required: boolean): number | null | undefined {
  const raw = score.value.trim();
  if (!raw) {
    if (required) errors.value = { score: `Enter a score from 0 to ${max.value} first.` };
    return required ? undefined : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > max.value) {
    errors.value = { score: `The score is a whole number from 0 to ${max.value}.` };
    return undefined;
  }
  return n;
}

function showError(e: unknown, fallback: string) {
  const fields = fieldErrorsOf(e);
  errors.value = {
    score: fields.score,
    reason: fields.reason,
    form: Object.keys(fields).length ? undefined : getApiErrorMessage(e, fallback),
  };
}

const run = (action: Parameters<typeof mutate.mutateAsync>[0]['action']) =>
  mutate.mutateAsync({
    assignmentId: assignmentId.value,
    submissionId: submissionId.value,
    action,
  });

async function saveGrade() {
  errors.value = {};
  const n = parsedScore(true);
  if (n === undefined) return;
  try {
    await run({ kind: 'grade', payload: { score: n, feedback: feedback.value } });
    toast.success('Grade saved. Only you can see it until you return it.');
  } catch (e) {
    showError(e, 'The grade wasn’t saved. Try again.');
  }
}

async function returnWork() {
  errors.value = {};
  const n = parsedScore(true);
  if (n === undefined || !s.value) return;
  await confirm({
    title: `Return ${s.value.studentName}’s work?`,
    description: 'The score and feedback become visible to the student and their guardian.',
    details: [
      ['Score', `${n} / ${max.value}`],
      ['Feedback', feedback.value.trim() || 'None'],
      ['Notifies', `${s.value.studentName} and their guardian`],
    ],
    confirmLabel: 'Return work',
    action: async () => {
      try {
        await run({ kind: 'return', payload: { score: n, feedback: feedback.value } });
      } catch (e) {
        showError(e, 'The work wasn’t returned. Try again.');
        throw e;
      }
      toast.success(`Returned to ${s.value!.studentName}.`);
    },
  });
}

async function excuse() {
  errors.value = {};
  if (excuseReason.value.trim().length < 3) {
    errors.value = { reason: 'Say why the student is excused.' };
    return;
  }
  try {
    await run({ kind: 'excuse', reason: excuseReason.value });
    toast.success(`${s.value?.studentName} is excused from this assignment.`);
  } catch (e) {
    showError(e, 'That didn’t save. Try again.');
  }
}

async function undoExcuse() {
  await confirm({
    title: 'Remove the excuse?',
    description: `${s.value?.studentName} goes back to Not submitted.`,
    confirmLabel: 'Remove excuse',
    action: async () => {
      await run({ kind: 'unexcuse' });
      toast.success('Excuse removed.');
    },
  });
}

const navTo = (id: string | null) =>
  id
    ? {
        name: r.assignments.submission.name,
        params: { assignmentId: assignmentId.value, submissionId: id },
      }
    : undefined;
const listTo = computed(() => ({
  name: r.assignments.submissions.name,
  params: { assignmentId: assignmentId.value },
}));
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="this submission"
    :reason="getApiErrorMessage(error)"
  />
  <EmptyState
    v-else-if="isNotFound(error)"
    title="Submission not found"
    description="The link may be wrong, or the assignment was deleted."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.assignments.list.name }">Back to assignments</RouterLink></Button
    >
  </EmptyState>
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The submission couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>
  <template v-else-if="isPending || !s || !a">
    <Skeleton class="h-16 w-full" />
    <Skeleton class="h-80 w-full" />
  </template>
  <template v-else>
    <PageHeader
      :title="s.studentName"
      :description="`${a.title} · ${a.classLabel}`"
      :meta="[
        { label: 'Admission no.', value: s.admissionNo },
        { label: 'Student', value: `${s.position} of ${s.of}` },
      ]"
    >
      <template #actions>
        <Button as-child variant="outline" size="sm">
          <RouterLink v-if="s.prevId" :to="navTo(s.prevId)!" aria-label="Previous student"
            ><ChevronLeftIcon class="size-4" /> Previous</RouterLink
          >
          <span v-else aria-disabled="true" class="opacity-50"
            ><ChevronLeftIcon class="size-4" /> Previous</span
          >
        </Button>
        <Button as-child variant="outline" size="sm">
          <RouterLink v-if="s.nextId" :to="navTo(s.nextId)!" aria-label="Next student"
            >Next <ChevronRightIcon class="size-4"
          /></RouterLink>
          <span v-else aria-disabled="true" class="opacity-50"
            >Next <ChevronRightIcon class="size-4"
          /></span>
        </Button>
        <Button as-child variant="ghost" size="sm"
          ><RouterLink :to="listTo">All submissions</RouterLink></Button
        >
      </template>
    </PageHeader>

    <InlineNotice v-if="lockReason" tone="info" title="Read-only" :description="lockReason" />

    <div class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard title="Work handed in">
          <template #actions><SubmissionStatusBadge :status="s.status" :late="s.late" /></template>
          <template v-if="handedIn">
            <p class="mb-3 text-[13px] text-muted-foreground">
              Handed in {{ when(s.submittedAt) }}
              <span v-if="s.late && a.dueAt" class="font-medium text-warning-strong">
                · {{ durationText(a.dueAt, s.submittedAt!) }} after the due time ({{
                  formatDeadline(a.dueAt)
                }})</span
              >
            </p>
            <FileList :files="s.fileList" empty-text="No files, only a note." />
            <div v-if="s.note" class="mt-3 rounded-md bg-muted px-3 py-2.5 text-[13px]">
              <span class="block text-xs font-medium text-muted-foreground"
                >Note from the student</span
              >
              {{ s.note }}
            </div>
          </template>
          <template v-else-if="s.status === 'Excused'">
            <p class="text-[13px]">
              Excused: <span class="text-muted-foreground">{{ s.excuseReason }}</span>
            </p>
            <p class="mt-1 text-xs text-faint">
              Excused work isn’t graded and doesn’t count against the student.
            </p>
            <Button
              v-if="!lockReason"
              variant="outline"
              size="sm"
              class="mt-3"
              :disabled="mutate.isPending.value"
              @click="undoExcuse"
              >Undo excuse</Button
            >
          </template>
          <template v-else>
            <p class="text-[13px]">Nothing handed in yet.</p>
            <p class="mt-1 text-xs text-muted-foreground">
              You can’t grade work that wasn’t submitted.
              {{
                a.status === 'Published'
                  ? 'The student can still hand it in from their portal.'
                  : 'Submissions are closed.'
              }}
              If they had a good reason, mark them Excused.
            </p>
            <div v-if="!lockReason" class="mt-3 flex flex-col gap-1.5">
              <label :for="`${uid}-reason`" class="text-[13px] font-medium"
                >Reason for excusing <span class="text-destructive">*</span></label
              >
              <Textarea
                :id="`${uid}-reason`"
                v-model="excuseReason"
                :rows="2"
                placeholder="Away at the inter-school quiz (letter from the principal)"
                :aria-invalid="!!errors.reason"
              />
              <p v-if="errors.reason" role="alert" class="text-xs text-destructive">
                {{ errors.reason }}
              </p>
              <Button
                variant="outline"
                size="sm"
                class="self-start"
                :disabled="mutate.isPending.value"
                @click="excuse"
                >Mark excused</Button
              >
            </div>
          </template>
        </SectionCard>
        <SectionCard>
          <ActivityTimeline
            :items="s.history"
            title="History"
            empty-text="Nothing has happened yet."
          />
        </SectionCard>
      </div>

      <SectionCard title="Grade" class="self-start">
        <form class="flex flex-col gap-4" novalidate @submit.prevent="saveGrade">
          <fieldset :disabled="!canGrade || mutate.isPending.value" class="contents">
            <div class="flex flex-col gap-1.5">
              <label :for="`${uid}-score`" class="text-[13px] font-medium"
                >Score <span class="text-faint">/ {{ max }}</span></label
              >
              <Input
                :id="`${uid}-score`"
                v-model="score"
                inputmode="numeric"
                class="w-28 bg-card"
                :placeholder="`0–${max}`"
                :aria-invalid="!!errors.score"
              />
              <p v-if="errors.score" role="alert" class="text-xs text-destructive">
                {{ errors.score }}
              </p>
              <p v-else class="text-xs text-faint">A whole number from 0 to {{ max }}.</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label :for="`${uid}-feedback`" class="text-[13px] font-medium">Feedback</label>
              <Textarea
                :id="`${uid}-feedback`"
                v-model="feedback"
                :rows="4"
                placeholder="Good method. Check the signs in question 4."
              />
            </div>
          </fieldset>
          <p v-if="!handedIn" class="text-xs text-muted-foreground">
            Grading opens once the student hands in work.
          </p>
          <p v-else-if="s.status === 'Graded'" class="text-xs text-muted-foreground">
            Saved privately {{ when(s.gradedAt) }}. Return it to show the student and guardian.
          </p>
          <p v-else-if="s.status === 'Returned'" class="text-xs text-muted-foreground">
            Returned {{ when(s.returnedAt) }}. You can regrade while the term is on; saving makes it
            private again until you return it.
          </p>
          <p v-if="errors.form" role="alert" class="text-xs text-destructive">{{ errors.form }}</p>
          <div v-if="canGrade" class="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" :disabled="mutate.isPending.value">
              <Spinner v-if="mutate.isPending.value" /> Save grade
            </Button>
            <Button type="button" :disabled="mutate.isPending.value" @click="returnWork">
              {{ s.status === 'Returned' ? 'Return again' : 'Return' }}
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  </template>
</template>
