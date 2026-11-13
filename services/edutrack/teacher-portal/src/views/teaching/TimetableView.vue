<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { computed } from 'vue';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useTeachingTimetableQuery } from '@/api/services/teaching';
import { campusClasses } from '@/components/teaching/campus';
import TimetableGrid from '@/components/teaching/TimetableGrid.vue';
import TodayLessons from '@/components/teaching/TodayLessons.vue';
import { useTermContext } from '@/composables/useTermContext';
import { formatDay, formatWeekday } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/api-errors';

const { term } = useTermContext();
const { data, isPending, error, refetch } = useTeachingTimetableQuery();

const campuses = computed(() => [
  ...new Map((data.value?.lessons ?? []).map((l) => [l.branchId, l.branchName])).entries(),
]);
const description = computed(() => {
  const d = data.value;
  if (!d?.published || !d.lessons.length) return term.value?.label ?? '';
  return `${term.value?.label} · ${d.lessons.length} lessons a week · published ${formatDay(d.publishedOn)}`;
});
</script>

<template>
  <PageHeader title="Timetable" :description="description" />
  <EmptyState
    v-if="error"
    title="Your timetable couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>
  <template v-else-if="isPending">
    <Skeleton class="h-40 w-full" />
    <Skeleton class="h-96 w-full" />
  </template>
  <EmptyState
    v-else-if="!data?.published"
    illustrated
    title="No timetable has been published for you yet"
    description="The academic office publishes the timetable before the term starts. You’ll get a notification when it is."
  />
  <EmptyState
    v-else-if="!data.lessons.length"
    illustrated
    title="You have no lessons on the timetable"
    description="The academic office assigns classes to teachers; your lessons appear here once they do."
  />
  <template v-else>
    <SectionCard
      flush
      :title="data.todayDay ? `Today · ${formatWeekday(data.today, { year: false })}` : 'Today'"
      :description="
        data.todayDay
          ? `${data.todayLessons.length} lesson${data.todayLessons.length === 1 ? '' : 's'}`
          : (data.todayNote ?? undefined)
      "
    >
      <p v-if="!data.todayDay" class="px-4 py-3 text-[13px] text-muted-foreground">
        No lessons today. {{ data.readOnly ? 'This term’s timetable is shown for reference.' : '' }}
      </p>
      <p v-else-if="!data.todayLessons.length" class="px-4 py-3 text-[13px] text-muted-foreground">
        You have no lessons today.
      </p>
      <TodayLessons v-else :lessons="data.todayLessons" :show-campus="data.multiCampus" />
    </SectionCard>
    <SectionCard
      flush
      title="My week"
      :description="data.readOnly ? 'Read-only' : 'Published by the academic office'"
    >
      <template v-if="data.multiCampus" #actions>
        <ul class="flex flex-wrap gap-2 text-xs" aria-label="Campuses">
          <li v-for="[id, name] in campuses" :key="id" class="flex items-center gap-1.5">
            <span :class="cn('size-2.5 rounded-full', campusClasses(id).dot)" aria-hidden="true" />
            {{ name }}
          </li>
        </ul>
      </template>
      <TimetableGrid
        :periods="data.periods"
        :days="data.days"
        :lessons="data.lessons"
        :today-day="data.todayDay"
        :show-campus="data.multiCampus"
      />
    </SectionCard>
  </template>
</template>
