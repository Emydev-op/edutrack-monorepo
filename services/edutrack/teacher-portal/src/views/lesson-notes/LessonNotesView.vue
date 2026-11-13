<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon, PlusIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useLessonNotesQuery } from '@/api/services/lesson-notes';
import NoteStatusBadge from '@/components/lesson-notes/NoteStatusBadge.vue';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { LessonNoteRow } from '@/types';

const { data, isPending, error } = useLessonNotesQuery();
const show = useRouteQuery<'action' | 'all' | 'submitted' | 'approved'>('show', 'action');
const slotFilter = useRouteQuery<string>('class', '');

const needsAction = (x: LessonNoteRow) =>
  x.overdue || x.dueThisWeek || x.status === 'Returned' || x.status === 'Draft';
const rows = computed(() =>
  (data.value?.rows ?? []).filter(
    (x) =>
      (!slotFilter.value || `${x.subject}|${x.level}` === slotFilter.value) &&
      (show.value === 'all' ||
        (show.value === 'action' && needsAction(x)) ||
        (show.value === 'submitted' && x.status === 'Submitted') ||
        (show.value === 'approved' && x.status === 'Approved')),
  ),
);
const weeks = computed(() => {
  const out: {
    week: number;
    label: string;
    midterm: boolean;
    due: string;
    rows: LessonNoteRow[];
  }[] = [];
  for (const x of rows.value) {
    let g = out.find((w) => w.week === x.week);
    if (!g)
      out.push(
        (g = { week: x.week, label: x.weekLabel, midterm: x.midterm, due: x.due, rows: [] }),
      );
    g.rows.push(x);
  }
  return out;
});
const nextDue = computed(
  () => data.value?.weeks.find((w) => w.week === data.value!.currentWeek + 1)?.due,
);

function action(x: LessonNoteRow) {
  if (!data.value?.editable) return 'View';
  if (x.status === 'Not written') return 'Write';
  if (x.status === 'Returned') return 'Fix and resubmit';
  if (x.status === 'Draft') return 'Continue';
  return 'View';
}
const linkFor = (x: LessonNoteRow) =>
  x.noteId
    ? { name: r.lessonNotes.detail.name, params: { noteId: x.noteId } }
    : data.value?.editable
      ? {
          name: r.lessonNotes.new.name,
          query: { slot: `${x.subject}|${x.level}`, week: String(x.week) },
        }
      : undefined;
</script>

<template>
  <PageHeader
    title="Lesson notes"
    :description="
      nextDue && data?.editable
        ? `One note per subject and class level each week, due the Friday before. Next week’s notes are due ${formatWeekday(nextDue, { year: false })}.`
        : 'One note per subject and class level each week, due the Friday before the week.'
    "
  >
    <template v-if="data?.editable && data.slots.length" #actions>
      <Button as-child
        ><RouterLink :to="{ name: r.lessonNotes.new.name }"
          ><PlusIcon class="size-4" /> New lesson note</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Your lesson notes couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton class="h-20 w-full" />
    <Skeleton v-for="i in 5" :key="i" class="h-14 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !data.slots.length"
    illustrated
    title="No lesson notes to write"
    description="Lesson notes are per subject and class level you teach. The academic office assigns classes; they appear here once they do."
  />
  <template v-else-if="data">
    <MetricGrid>
      <MetricCard
        label="Overdue"
        :value="data.counts.overdue"
        :hint="data.counts.overdue ? 'Past the Friday they were due' : 'Nothing overdue'"
        :hint-tone="data.counts.overdue ? 'error' : 'success'"
      />
      <MetricCard
        label="Due this week"
        :value="data.counts.dueThisWeek"
        :hint="nextDue ? `By ${formatWeekday(nextDue, { year: false })}` : ''"
        :hint-tone="data.counts.dueThisWeek ? 'warning' : 'neutral'"
      />
      <MetricCard
        label="Returned"
        :value="data.counts.returned"
        hint="Fix and resubmit"
        :hint-tone="data.counts.returned ? 'error' : 'neutral'"
      />
      <MetricCard
        label="Waiting for review"
        :value="data.counts.waiting"
        :hint="`${data.counts.approved} approved this term`"
      />
    </MetricGrid>

    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl
        v-model="show"
        label="Show"
        class="flex-wrap"
        :options="[
          { value: 'action', label: 'Needs action' },
          { value: 'all', label: 'All' },
          { value: 'submitted', label: 'Submitted' },
          { value: 'approved', label: 'Approved' },
        ]"
      />
      <NativeSelect
        v-if="data.slots.length > 1"
        v-model="slotFilter"
        aria-label="Class"
        class="min-w-44"
      >
        <NativeSelectOption value="">All subjects and levels</NativeSelectOption>
        <NativeSelectOption v-for="s in data.slots" :key="s.key" :value="s.key">{{
          s.label
        }}</NativeSelectOption>
      </NativeSelect>
    </div>

    <InlineNotice
      v-if="data.lockReason"
      tone="neutral"
      title="Read-only"
      :description="data.lockReason"
    />

    <p
      v-if="!weeks.length"
      class="rounded-lg border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground"
    >
      {{
        show === 'action' ? 'Nothing needs your attention. Every note is in.' : 'No notes match.'
      }}
    </p>
    <section v-for="w in weeks" :key="w.week" class="flex flex-col gap-1.5">
      <h2 class="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">
        {{ w.label }}
        <span class="text-xs font-normal text-muted-foreground"
          >due {{ formatWeekday(w.due, { year: false })
          }}<template v-if="w.midterm"> · mid-term week</template></span
        >
      </h2>
      <ul class="flex flex-col divide-y divide-divider rounded-lg border bg-card">
        <li v-for="x in w.rows" :key="x.key">
          <component
            :is="linkFor(x) ? RouterLink : 'div'"
            :to="linkFor(x)"
            class="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-warm"
          >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ x.label }}</span>
                <NoteStatusBadge :status="x.status" :overdue="x.overdue" />
              </span>
              <span v-if="x.topic" class="truncate text-xs text-muted-foreground">{{
                x.topic
              }}</span>
              <span v-if="x.status === 'Returned'" class="line-clamp-2 text-xs text-error-strong"
                >“{{ x.returnComment }}”</span
              >
            </span>
            <span
              v-if="linkFor(x)"
              class="flex shrink-0 items-center gap-1 text-[13px] font-medium whitespace-nowrap text-primary"
              >{{ action(x) }} <ChevronRightIcon class="size-4"
            /></span>
          </component>
        </li>
      </ul>
    </section>
  </template>
</template>
