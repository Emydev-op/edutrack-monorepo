<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useReviewNotesQuery } from '@/api/services/reviews';
import AccessDenied from '@/components/common/AccessDenied.vue';
import NoteStatusBadge from '@/components/lesson-notes/NoteStatusBadge.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDateTime } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';

const { data, isPending, error } = useReviewNotesQuery();
</script>

<template>
  <PageHeader
    title="Lesson notes to review"
    :description="
      data
        ? `${data.scope}. Approve each note, or return it with what to change.`
        : 'Lesson notes waiting for you.'
    "
  />
  <AccessDenied
    v-if="isForbidden(error)"
    what="lesson note reviews"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="The review queue couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
  </div>
  <template v-else-if="data">
    <SectionCard
      :title="`Waiting on you · ${data.waiting.length}`"
      :description="
        data.scope.includes('HODs')
          ? 'Oldest first. Your own notes go to the academic office.'
          : 'Oldest first. Your own notes skip you and go to the Academic Head.'
      "
      flush
    >
      <EmptyState
        v-if="!data.waiting.length"
        title="Nothing waiting"
        description="When a teacher submits a lesson note to you, it appears here and you’re notified."
      />
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li v-for="n in data.waiting" :key="n.id">
          <RouterLink
            :to="{ name: routesPath.reviews.note.name, params: { noteId: n.id } }"
            class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="font-semibold"
                >{{ n.level }} · {{ n.subjectName }} · Week {{ n.week }}</span
              >
              <span class="truncate text-xs text-muted-foreground"
                >{{ n.teacher }} · {{ n.topic }}</span
              >
              <span class="text-xs text-faint"
                >{{ n.department }} · submitted {{ formatDateTime(n.submittedAt, false) }}</span
              >
            </span>
            <span class="flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary"
              >Review <ChevronRightIcon class="size-4"
            /></span>
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
    <SectionCard v-if="data.recent.length" title="You reviewed" description="Latest first." flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="n in data.recent" :key="n.id">
          <RouterLink
            :to="{ name: routesPath.reviews.note.name, params: { noteId: n.id } }"
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col">
              <span class="font-medium"
                >{{ n.level }} · {{ n.subjectName }} · Week {{ n.week }}</span
              >
              <span class="text-xs text-muted-foreground">{{ n.teacher }} · {{ n.decision }}</span>
            </span>
            <NoteStatusBadge :status="n.status" />
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </template>
</template>
