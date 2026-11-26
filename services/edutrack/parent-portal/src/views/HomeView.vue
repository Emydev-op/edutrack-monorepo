<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useHomeQuery } from '@/api/services/parent';
import AlertCard from '@/components/common/AlertCard.vue';
import BoardingCard from '@/components/common/BoardingCard.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { formatDeadline, formatLongDate, formatWeekday, greeting } from '@/lib/dates';
import { feeLine, homeworkTone, resultLine } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';
import { useChildrenStore } from '@/stores/children';

const route = useRoute();
const router = useRouter();
const store = useChildrenStore();
const { overview, children, child, id } = useCurrentChild();
const home = useHomeQuery(id);

const o = computed(() => overview.data.value!);
const sub = computed(() => {
  const t = o.value.term;
  const today = formatLongDate(o.value.today);
  return t ? `${today} · ${t.name} ends ${formatWeekday(t.endsOn, { year: false })}` : today;
});
const first = computed(() => route.query.first === '1');
const result = computed(() => (home.data.value ? resultLine(home.data.value.latestResult) : null));

function chooseFirst(childId: string) {
  store.select(childId);
  void router.replace({ name: routesPath.home.name });
}

const TONE = { error: 'error', warning: 'warning', info: 'info', success: 'success' } as const;
const alertTo = (to: string) =>
  to === '/fees/pay'
    ? { name: routesPath.fees.pay.name }
    : to === '/attendance'
      ? { name: routesPath.attendance.name }
      : { name: routesPath.fees.view.name };
</script>

<template>
  <PageTitle :title="`${greeting()}, ${o.parent.firstName}`" :sub="sub" />

  <!-- First sign-in: who to view first. -->
  <div v-if="first" role="status" class="flex flex-col gap-2.5 rounded-lg bg-brand-subtle p-3.5">
    <span class="flex flex-col gap-0.5">
      <span class="font-semibold text-brand-strong"
        >Welcome, {{ o.parent.firstName }}. Your account is ready.</span
      >
      <span class="text-[13px] text-pretty text-[#5A4A3F]">
        You’re linked to {{ children.length }} {{ children.length === 1 ? 'child' : 'children' }} at
        {{ o.school.name }}.
        {{
          children.length > 1
            ? 'Choose who to view first. You can switch any time from the bar at the top.'
            : ''
        }}
      </span>
    </span>
    <div class="flex flex-col gap-1.5">
      <button
        v-for="c in children"
        :key="c.id"
        type="button"
        class="flex min-h-13 items-center gap-2.5 rounded-lg border border-[#E5D3B8] bg-card px-3 py-2 text-left"
        @click="chooseFirst(c.id)"
      >
        <span
          class="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
          >{{ c.initials }}</span
        >
        <span class="flex flex-1 flex-col">
          <span class="font-medium">{{ c.name }}</span>
          <span class="text-xs text-muted-foreground">{{ c.className }}</span>
        </span>
        <span class="text-[13px] font-medium text-primary">View →</span>
      </button>
    </div>
  </div>

  <!-- Every child at a glance. -->
  <div
    v-if="children.length > 1"
    class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5"
  >
    <button
      v-for="c in children"
      :key="c.id"
      type="button"
      class="flex min-h-22 flex-col gap-1 rounded-lg border-[1.5px] bg-card px-3.5 py-3 text-left"
      :class="c.id === child?.id ? 'border-primary' : 'border-border'"
      :aria-pressed="c.id === child?.id"
      @click="store.select(c.id)"
    >
      <span class="flex items-center justify-between gap-2">
        <span class="text-sm font-semibold">{{ c.name }}</span>
        <StatusBadge :label="feeLine(c.fees).status" />
      </span>
      <span class="text-xs text-muted-foreground"
        >{{ c.className || 'No class yet' }}{{ c.branch ? ` · ${c.branch}` : '' }}</span
      >
      <span class="text-xs">Fees: {{ feeLine(c.fees).text.toLowerCase() }}</span>
    </button>
  </div>

  <QueryState
    v-if="!home.data.value"
    :loading="home.isPending.value"
    :error="home.error.value"
    @retry="home.refetch()"
  />
  <template v-else>
    <AlertCard
      v-for="a in home.data.value.alerts"
      :key="a.kind"
      :tone="TONE[a.tone]"
      :title="a.title"
      :text="a.text"
      :action="a.action ? { label: a.action.label, to: alertTo(a.action.to) } : null"
    />

    <ListSection
      :title="`Latest result · ${child?.firstName ?? ''}`"
      link="All results"
      :to="{ name: routesPath.results.name }"
    >
      <ListRow
        v-if="result"
        :title="result.title"
        :sub="result.sub"
        :badge="result.badge"
        :to="{ name: routesPath.results.name }"
      />
    </ListSection>

    <ListSection
      title="Assignments"
      link="All"
      :to="{ name: routesPath.assignments.list.name }"
      :empty="home.data.value.homework.length ? undefined : 'No assignments this term yet.'"
    >
      <ListRow
        v-for="a in home.data.value.homework"
        :key="a.id"
        :title="a.title"
        :sub="`${a.subjectName} · ${a.teacherName} · due ${formatDeadline(a.dueAt)}`"
        :badge="a.status"
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
        v-for="l in home.data.value.today.lessons.slice(0, 4)"
        :key="l.start"
        :title="l.subject"
        :sub="l.teacher"
        :right="`${l.start}–${l.end}`"
      />
    </ListSection>

    <BoardingCard v-if="child" :child="child" />

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
