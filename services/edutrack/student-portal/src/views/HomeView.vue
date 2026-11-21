<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { useHomeQuery, useOverviewQuery } from '@/api/services/student';
import AlertCard from '@/components/common/AlertCard.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import StatGrid from '@/components/common/StatGrid.vue';
import { formatDeadline, formatLongDate, greeting } from '@/lib/dates';
import { homeworkTone, lagosTime, nextLesson, resultLine } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';

const overview = useOverviewQuery();
const home = useHomeQuery();

const o = computed(() => overview.data.value!);
const sub = computed(() =>
  [formatLongDate(o.value.today), o.value.student.className].filter(Boolean).join(' · '),
);
const result = computed(() => (home.data.value ? resultLine(home.data.value.latestResult) : null));
const next = computed(() =>
  home.data.value ? nextLesson(home.data.value.today.lessons, lagosTime()) : null,
);
const attendance = computed(() => {
  const a = home.data.value?.attendance;
  if (!a?.schoolDays) return null;
  return [
    { label: 'Present', value: a.percent === null ? '–' : `${a.percent}%` },
    { label: 'Late', value: String(a.late) },
    { label: 'Absent', value: String(a.absent), tone: a.absent ? ('error' as const) : undefined },
  ];
});
</script>

<template>
  <PageTitle :title="`${greeting()}, ${o.student.firstName}`" :sub="sub" />

  <QueryState
    v-if="!home.data.value"
    :loading="home.isPending.value"
    :error="home.error.value"
    @retry="home.refetch()"
  />
  <template v-else>
    <AlertCard
      v-if="next"
      tone="info"
      :title="`${next.now ? 'Now' : 'Next lesson'} · ${next.lesson.start} ${next.lesson.subject}`"
      :text="next.lesson.teacher"
    />
    <AlertCard
      v-if="home.data.value.latestResult.status === 'published'"
      tone="success"
      :title="`Your ${home.data.value.latestResult.term} results are out`"
      :text="
        home.data.value.latestResult.average
          ? `Average ${home.data.value.latestResult.average}`
          : null
      "
      :action="{ label: 'View', to: { name: routesPath.results.name } }"
    />

    <ListSection
      title="Assignments due"
      link="All"
      :to="{ name: routesPath.assignments.list.name }"
      :empty="
        home.data.value.homework.length ? undefined : 'All caught up. No assignments waiting.'
      "
    >
      <ListRow
        v-for="a in home.data.value.homework"
        :key="a.id"
        :title="a.title"
        :sub="`${a.subjectName} · due ${formatDeadline(a.dueAt)}`"
        :badge="a.pastDue ? 'Past due' : a.status"
        :tone="homeworkTone(a.status, a.pastDue)"
        :to="{ name: routesPath.assignments.detail.name, params: { assignmentId: a.id } }"
      />
    </ListSection>

    <ListSection
      :title="`Today${home.data.value.today.className ? ` · ${home.data.value.today.className}` : ''}`"
      link="Timetable"
      :to="{ name: routesPath.timetable.name }"
      :empty="
        home.data.value.today.lessons.length
          ? undefined
          : home.data.value.today.day
            ? 'No lessons on the published timetable today.'
            : 'No school today.'
      "
    >
      <ListRow
        v-for="l in home.data.value.today.lessons.slice(0, 5)"
        :key="l.start"
        :title="l.subject"
        :sub="l.teacher"
        :right="`${l.start}–${l.end}`"
      />
    </ListSection>

    <ListSection title="Latest result" link="My results" :to="{ name: routesPath.results.name }">
      <ListRow
        v-if="result"
        :title="result.title"
        :sub="result.sub"
        :badge="result.badge"
        :to="{ name: routesPath.results.name }"
      />
    </ListSection>

    <section v-if="attendance" class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Attendance · {{ home.data.value.term }}</h2>
        <RouterLink :to="{ name: routesPath.attendance.name }" class="text-[13px] text-primary"
          >Details</RouterLink
        >
      </div>
      <StatGrid :items="attendance" />
    </section>

    <ListSection
      title="Announcements"
      link="All"
      :to="{ name: routesPath.announcements.name }"
      :empty="home.data.value.announcements.length ? undefined : 'No announcements right now.'"
    >
      <ListRow
        v-for="a in home.data.value.announcements"
        :key="a.id"
        :title="a.title"
        :sub="`${a.from} · ${a.date}`"
        :to="{ name: routesPath.announcements.name, hash: `#a-${a.id}` }"
      />
    </ListSection>
  </template>
</template>
