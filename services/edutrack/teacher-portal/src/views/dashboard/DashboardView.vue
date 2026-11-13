<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useDashboardQuery } from '@/api/services/dashboard';
import { useMeQuery } from '@/api/services/shell';
import { countdown } from '@/components/results/sheet-status';
import TodayLessons from '@/components/teaching/TodayLessons.vue';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatDeadline, formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

import AnnouncementsCard from './components/AnnouncementsCard.vue';
import TodoCard from './components/TodoCard.vue';

const route = useRoute();
const auth = useAuthStore();
const { activeTerm, returnToActive } = useTermContext();
const { data: me } = useMeQuery();
/** Mock only: `/dashboard?simulate=todo` shows one block failing while the rest still load. */
const simulate = computed(() =>
  typeof route.query.simulate === 'string' ? route.query.simulate : undefined,
);
const { data, isPending, error, refetch } = useDashboardQuery(simulate);

const d = computed(() => data.value ?? null);
const metrics = computed(() => (d.value?.metrics.ok ? d.value.metrics.data : null));
const lessons = computed(() => (d.value?.lessons.ok ? d.value.lessons.data : null));
const readOnly = computed(() => Boolean(d.value?.lockReason));

const greeting = computed(() => {
  const user = auth.user;
  const name = user ? `${user.title} ${user.lastName}` : '';
  const hour = Number((d.value?.now ?? '').slice(11, 13));
  const part = !d.value
    ? 'Welcome'
    : hour < 12
      ? 'Good morning'
      : hour < 17
        ? 'Good afternoon'
        : 'Good evening';
  return `${part}, ${name}`.trim();
});
const description = computed(() => {
  if (!d.value) return '';
  return [formatWeekday(d.value.today), d.value.termLabel, d.value.campuses.join(' and ')]
    .filter(Boolean)
    .join(' · ');
});

const profileIncomplete = computed(() =>
  me.value ? !me.value.profileComplete : d.value ? !d.value.profileComplete : false,
);

const sheetsHint = computed(() => {
  const s = metrics.value?.sheets;
  if (!s) return undefined;
  if (!s.total) return 'No sheets this term';
  if (s.submitted === s.total) return 'All submitted';
  if (!s.deadline) return 'No deadline set';
  if (!s.entryOpen) return readOnly.value ? 'Read-only term' : 'Result entry closed';
  const left = countdown(s.deadline, d.value?.now ?? '');
  return `Closes ${formatDeadline(s.deadline)}${left ? ` · ${left.label}` : ''}`;
});
const sheetsTone = computed(() => {
  const s = metrics.value?.sheets;
  if (!s || !s.total || s.submitted === s.total) return 'success' as const;
  if (!s.entryOpen || !s.deadline) return 'neutral' as const;
  return countdown(s.deadline, d.value?.now ?? '')?.urgent ? 'error' : 'warning';
});

const reviewsWaiting = computed(() => {
  const rv = metrics.value?.reviews;
  return rv ? (rv.sheets ?? 0) + (rv.notes ?? 0) : 0;
});
const reviewsHint = computed(() => {
  const rv = metrics.value?.reviews;
  if (!rv) return '';
  const parts = [];
  if (rv.sheets !== null) parts.push(`${rv.sheets} sheet${rv.sheets === 1 ? '' : 's'}`);
  if (rv.notes !== null) parts.push(`${rv.notes} lesson note${rv.notes === 1 ? '' : 's'}`);
  return parts.join(' · ');
});
const reviewsTo = computed(() => {
  const rv = metrics.value?.reviews;
  return {
    name:
      rv && rv.sheets !== null && (rv.sheets > 0 || rv.notes === null)
        ? r.reviews.results.name
        : r.reviews.lessonNotes.name,
  };
});

const readOnlyTodo = computed(() =>
  d.value?.lockReason
    ? `Nothing to do in ${d.value.termLabel}: it’s read-only. Your to-do list is for the active term${activeTerm.value ? ` (${activeTerm.value.label})` : ''}.`
    : null,
);
</script>

<template>
  <PageHeader :title="greeting" :description="description">
    <template v-if="d?.hasAssignments && !readOnly" #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: r.teaching.timetable.name }">Timetable</RouterLink></Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: r.results.list.name }">Results</RouterLink></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="profileIncomplete"
    tone="brand"
    title="Complete your profile: add your phone number"
    description="The school office uses it to reach you about your classes and urgent changes. It’s never shown to students or guardians."
  >
    <template #action>
      <Button as-child size="sm"
        ><RouterLink :to="{ name: r.profile.edit.name }">Add phone number</RouterLink></Button
      >
    </template>
  </InlineNotice>

  <EmptyState
    v-if="error"
    title="Your dashboard couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>

  <template v-else>
    <InlineNotice
      v-if="d && readOnly"
      tone="neutral"
      :title="`You’re looking at ${d.termLabel}`"
      :description="`${d.lockReason} The figures below are for that term; to-dos and today’s lessons are for the active term.`"
    >
      <template v-if="activeTerm" #action>
        <Button variant="outline" size="sm" @click="returnToActive"
          >Back to {{ activeTerm.name }}</Button
        >
      </template>
    </InlineNotice>

    <EmptyState
      v-if="d && !d.hasAssignments"
      illustrated
      :title="
        d.termStatus === 'Upcoming'
          ? `No classes assigned for ${d.termLabel} yet`
          : d.termStatus === 'Closed'
            ? `You had no classes in ${d.termLabel}`
            : 'No classes assigned yet'
      "
      description="The academic office assigns classes and subjects to teachers. Your timetable, assignments and result sheets appear here as soon as they do; speak to them if you expected some."
    >
      <div class="flex flex-wrap justify-center gap-2">
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: r.profile.view.name }">Your profile</RouterLink></Button
        >
      </div>
    </EmptyState>
    <AnnouncementsCard v-if="d && !d.hasAssignments" class="max-w-xl" />

    <template v-else>
      <MetricGrid>
        <template v-if="isPending">
          <MetricCard v-for="i in 4" :key="i" label="" loading />
        </template>
        <InlineNotice
          v-else-if="d && !d.metrics.ok"
          tone="error"
          title="Figures couldn’t load"
          :description="d.metrics.error"
          class="col-span-full"
        >
          <template #action>
            <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
          </template>
        </InlineNotice>
        <template v-else-if="metrics">
          <MetricCard
            label="Classes today"
            :value="metrics.classesToday"
            :hint="
              metrics.nextLesson
                ? metrics.nextLesson.now
                  ? `Now: ${metrics.nextLesson.armName} until ${metrics.nextLesson.end}`
                  : `Next: ${metrics.nextLesson.armName} at ${metrics.nextLesson.start}`
                : (metrics.noLessonsReason ??
                  (metrics.classesToday ? 'All done for today' : 'None today'))
            "
            :to="{ name: r.teaching.timetable.name }"
          />
          <MetricCard
            label="Submissions to grade"
            :value="metrics.toGrade"
            :hint="
              metrics.toGrade
                ? `Across ${metrics.toGradeAssignments} assignment${metrics.toGradeAssignments === 1 ? '' : 's'}`
                : 'All graded'
            "
            :hint-tone="metrics.toGrade ? 'warning' : 'success'"
            :to="{ name: r.assignments.list.name, query: { status: 'To grade' } }"
          />
          <MetricCard
            label="Result sheets submitted"
            :value="`${metrics.sheets.submitted} of ${metrics.sheets.total}`"
            :hint="sheetsHint"
            :hint-tone="sheetsTone"
            :to="{ name: r.results.list.name }"
          />
          <MetricCard
            v-if="metrics.register"
            label="Today’s register"
            :value="
              metrics.register.closedReason ? '—' : metrics.register.taken ? 'Taken' : 'Not taken'
            "
            :hint="metrics.register.closedReason ?? metrics.register.armName"
            :hint-tone="
              metrics.register.closedReason
                ? 'neutral'
                : metrics.register.taken
                  ? 'success'
                  : 'warning'
            "
            :to="{ name: r.classTeacher.register.name }"
          />
          <MetricCard
            v-if="metrics.reviews"
            label="Reviews waiting"
            :value="reviewsWaiting"
            :hint="reviewsHint"
            :hint-tone="reviewsWaiting ? 'warning' : 'success'"
            :to="reviewsTo"
          />
        </template>
      </MetricGrid>

      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TodoCard :block="d?.todo" :read-only-note="readOnlyTodo" @retry="refetch()" />
        <div class="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Today’s lessons"
            :description="d ? formatWeekday(d.today, { year: false }) : undefined"
            flush
          >
            <template #actions>
              <Button as-child variant="ghost" size="sm"
                ><RouterLink :to="{ name: r.teaching.timetable.name }">My week</RouterLink></Button
              >
            </template>
            <div v-if="isPending" class="flex flex-col gap-2 p-4">
              <Skeleton v-for="i in 3" :key="i" class="h-10" />
            </div>
            <div v-else-if="d && !d.lessons.ok" class="p-4">
              <InlineNotice
                tone="error"
                title="Today’s lessons couldn’t load"
                :description="d.lessons.error"
              >
                <template #action>
                  <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
                </template>
              </InlineNotice>
            </div>
            <TodayLessons
              v-else-if="lessons?.lessons.length"
              :lessons="lessons.lessons"
              :show-campus="lessons.multiCampus"
            />
            <p v-else-if="lessons" class="px-4 py-5 text-[13px] text-muted-foreground">
              {{
                !lessons.published
                  ? 'The timetable for this term isn’t published yet. You’ll be notified when it is.'
                  : lessons.note
                    ? `No lessons today: ${lessons.note}`
                    : 'You have no lessons today.'
              }}
            </p>
          </SectionCard>

          <AnnouncementsCard />
        </div>
      </div>
    </template>
  </template>
</template>
