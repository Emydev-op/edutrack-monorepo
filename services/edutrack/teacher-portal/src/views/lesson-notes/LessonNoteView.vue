<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useLessonNoteQuery, useLessonNotesQuery } from '@/api/services/lesson-notes';
import AccessDenied from '@/components/common/AccessDenied.vue';
import LessonNoteBody from '@/components/lesson-notes/LessonNoteBody.vue';
import LessonNoteForm from '@/components/lesson-notes/LessonNoteForm.vue';
import NoteStatusBadge from '@/components/lesson-notes/NoteStatusBadge.vue';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDateTime, formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const noteId = computed(() => String(route.params.noteId ?? ''));
const { data: note, isPending, error } = useLessonNoteQuery(noteId);
const { data: list } = useLessonNotesQuery();

const title = computed(() => (note.value ? `${note.value.level} · ${note.value.subjectName}` : ''));
watch(
  () => note.value && `${title.value} · Week ${note.value.week}`,
  (t) => layout.setRecordLabel(t || null),
  { immediate: true },
);
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
        ><RouterLink :to="{ name: r.lessonNotes.list.name }"
          >Back to lesson notes</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="note">
    <header class="flex flex-col gap-1">
      <div class="flex flex-wrap items-center gap-2.5">
        <h1 class="text-2xl leading-tight font-semibold">{{ title }}</h1>
        <NoteStatusBadge :status="note.status" :overdue="note.overdue" />
      </div>
      <p class="text-[13px] text-muted-foreground">
        {{ note.weekLabel }}<template v-if="note.midterm"> · mid-term week</template> · due
        {{ formatWeekday(note.due, { year: false }) }} ·
        {{ note.noReview ? 'no review needed (Academic Head)' : `reviewer ${note.reviewer}` }}
        <template v-if="note.submittedAt">
          · submitted {{ formatDateTime(note.submittedAt, false) }}</template
        >
      </p>
    </header>

    <InlineNotice
      v-if="note.status === 'Returned'"
      tone="error"
      :title="`Returned by ${note.reviewer}`"
      :description="`“${note.returnComment}” Make the changes, then resubmit: it goes back to ${note.reviewer}.`"
    />
    <InlineNotice
      v-else-if="note.overdue"
      tone="warning"
      title="Overdue"
      :description="`This note was due ${formatWeekday(note.due, { year: false })}. Submit it as soon as you can.`"
    />
    <InlineNotice
      v-if="note.lockReason"
      :tone="note.status === 'Approved' ? 'success' : 'info'"
      :title="
        note.status === 'Approved'
          ? 'Approved'
          : note.status === 'Submitted'
            ? 'Waiting for review'
            : 'Read-only'
      "
      :description="note.lockReason"
    />

    <LessonNoteForm v-if="note.editable && list" :list="list" :note="note" />
    <Skeleton v-else-if="note.editable" class="h-96 w-full max-w-3xl" />
    <LessonNoteBody v-else :note="note" class="max-w-3xl" />

    <ActivityTimeline title="History" :items="note.history" />
  </template>
</template>
