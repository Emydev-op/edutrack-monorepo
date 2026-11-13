<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useLessonNotesQuery } from '@/api/services/lesson-notes';
import LessonNoteForm from '@/components/lesson-notes/LessonNoteForm.vue';
import { getApiErrorMessage } from '@/lib/api-errors';

const { data, isPending, error } = useLessonNotesQuery();
</script>

<template>
  <PageHeader
    title="New lesson note"
    description="One note per subject, class level and week. It’s due the Friday before the week it covers."
  />
  <InlineNotice
    v-if="error"
    tone="error"
    title="Your subjects couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <Skeleton v-else-if="isPending" class="h-[520px] w-full max-w-3xl" />
  <InlineNotice
    v-else-if="data && !data.editable"
    tone="neutral"
    title="This term is read-only"
    :description="data.lockReason ?? 'Only the active term can be changed.'"
  />
  <EmptyState
    v-else-if="data && !data.slots.length"
    illustrated
    title="No classes to write notes for yet"
    description="The academic office assigns your classes. Once they do, you can write lesson notes."
  />
  <LessonNoteForm v-else-if="data" :list="data" />
</template>
