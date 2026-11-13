<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useNoteDecisionMutation, useReviewNoteQuery } from '@/api/services/reviews';
import AccessDenied from '@/components/common/AccessDenied.vue';
import LessonNoteBody from '@/components/lesson-notes/LessonNoteBody.vue';
import NoteStatusBadge from '@/components/lesson-notes/NoteStatusBadge.vue';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDateTime, formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const noteId = computed(() => String(route.params.noteId));
const { data: note, isPending, error, refetch } = useReviewNoteQuery(noteId);
const decide = useNoteDecisionMutation(noteId);

const title = computed(() =>
  note.value ? `${note.value.level} · ${note.value.subjectName} · Week ${note.value.week}` : '',
);
watch(title, (t) => layout.setRecordLabel(t || null), { immediate: true });

async function after(message: string) {
  toast.success(message);
  await router.push({ name: routesPath.reviews.lessonNotes.name });
}

function approve() {
  const n = note.value!;
  void confirm({
    title: `Approve ${n.teacher}’s lesson note?`,
    details: [
      ['Note', title.value],
      ['Topic', n.topic],
      ['Status', 'Approved: read-only from now on'],
      ['Notifies', n.teacher],
    ],
    confirmLabel: 'Approve note',
    action: async () => {
      try {
        await decide.mutateAsync({ action: 'approve' });
      } catch (e) {
        void refetch();
        throw e;
      }
      await after(`Approved. ${n.teacher} has been notified.`);
    },
  });
}

function returnNote() {
  const n = note.value!;
  void confirm({
    title: `Return this note to ${n.teacher}?`,
    details: [
      ['Note', title.value],
      ['Status', 'Returned: the teacher edits it and resubmits it to you'],
      ['Notifies', n.teacher],
    ],
    input: {
      label: 'What should the teacher change? (10 characters or more)',
      placeholder: 'e.g. Add worked examples and a short exit check.',
      required: true,
    },
    confirmLabel: 'Return note',
    tone: 'destructive',
    action: async ({ text }) => {
      if (text.trim().length < 10)
        throw new Error('Tell the teacher what to change (10 characters or more).');
      try {
        await decide.mutateAsync({ action: 'return', comment: text });
      } catch (e) {
        void refetch();
        throw e;
      }
      await after(`Returned to ${n.teacher} with your comment.`);
    },
  });
}
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-4">
    <Skeleton class="h-14 w-2/3" />
    <Skeleton class="h-80 w-full" />
  </div>
  <AccessDenied
    v-else-if="isForbidden(error)"
    what="that lesson note"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    :title="isNotFound(error) ? 'This lesson note wasn’t found' : 'This lesson note couldn’t load'"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.reviews.lessonNotes.name }"
          >Back to reviews</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="note">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-2xl leading-tight font-semibold">{{ title }}</h1>
          <NoteStatusBadge :status="note.status" />
        </div>
        <p class="text-[13px] text-muted-foreground">
          {{ note.teacher }} · {{ note.department }} · {{ note.weekLabel
          }}<template v-if="note.midterm"> · mid-term week</template> · due
          {{ formatWeekday(note.due, { year: false }) }}
          <template v-if="note.submittedAt">
            · submitted {{ formatDateTime(note.submittedAt, false) }}</template
          >
        </p>
      </div>
      <div v-if="note.canDecide" class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="decide.isPending.value" @click="returnNote"
          >Return to teacher</Button
        >
        <Button :disabled="decide.isPending.value" @click="approve">Approve</Button>
      </div>
    </header>

    <InlineNotice
      v-if="note.canDecide"
      tone="info"
      title="Waiting for your review"
      :description="`Read the note, then approve it or return it to ${note.teacher} with what to change. Both notify them.`"
    />
    <InlineNotice
      v-else
      tone="neutral"
      title="No action needed"
      :description="note.decisionNote ?? ''"
    />
    <InlineNotice
      v-if="note.status === 'Returned' && note.returnComment"
      tone="error"
      title="Your comment"
      :description="`“${note.returnComment}”`"
    />

    <LessonNoteBody :note="note" class="max-w-3xl" />
    <ActivityTimeline title="History" :items="note.history" />
  </template>
</template>
