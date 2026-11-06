<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { EyeIcon, SchoolIcon, UserPlusIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { useSchoolsQuery } from '@/api/services/schools';
import { useIssuesQuery, useSupportSummaryQuery } from '@/api/services/support';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { isDone, SUPPORT_AGENT_NAMES } from '@/config/support-desk';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { routesPath } from '@/router/routes-path';
import {
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  type IssueQuery,
  type IssueView,
  type SupportIssue,
  type SupportSummary,
} from '@/types';

import { ISSUE_PRIORITY_TONE, ISSUE_STATUS_TONE, SLA_TONE } from './components/issue-tones';
import SupportCharts from './components/SupportCharts.vue';
import { useIssueActions } from './components/useIssueActions';

/** Views with a count on their tab come from the summary. */
const VIEWS: [IssueView, string, counted?: boolean][] = [
  ['open', 'All open', true],
  ['unassigned', 'Unassigned', true],
  ['mine', 'My tickets', true],
  ['overdue', 'Overdue', true],
  ['waiting', 'Waiting / on hold'],
  ['escalated', 'Escalated'],
  ['resolved', 'Awaiting confirmation'],
  ['closed', 'Closed'],
  ['all', 'All'],
];

const view = useRouteQuery<IssueView>('view', 'open');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
const priority = ref('');
const category = ref('');
const school = ref('');
const assignee = ref('');
const created = ref<DateRangeValue>({});
watch([debouncedSearch, priority, category, school, assignee, created], () => (page.value = '1'));

const { data: summary } = useSupportSummaryQuery();
const { data: schools } = useSchoolsQuery({ pageSize: 100 });
const schoolNames = computed(() => (schools.value?.data ?? []).map((s) => s.name));
const schoolIdByName = computed(
  () => new Map((schools.value?.data ?? []).map((s) => [s.name, s.id])),
);

const { data, isPending } = useIssuesQuery(() => ({
  view: view.value,
  search: debouncedSearch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
  priority: (priority.value || undefined) as IssueQuery['priority'],
  category: (category.value || undefined) as IssueQuery['category'],
  schoolId: school.value ? schoolIdByName.value.get(school.value) : undefined,
  assignee: assignee.value || undefined,
  dateFrom: created.value.from,
  dateTo: created.value.to,
}));

const tabs = computed(() =>
  VIEWS.map(([key, label, counted]) => ({
    label:
      counted && summary.value
        ? `${label} · ${summary.value.views[key as keyof SupportSummary['views']]}`
        : label,
    to: { query: key === 'open' ? {} : { view: key } },
    active: view.value === key,
  })),
);
const supportBy = (v?: IssueView) => ({
  name: routesPath.support.list.name,
  query: v ? { view: v } : {},
});
const metrics = computed(() => {
  const s = summary.value;
  return [
    { label: 'Open tickets', value: s?.open, to: supportBy('open') },
    { label: 'Unassigned', value: s?.unassigned, to: supportBy('unassigned') },
    {
      label: 'SLA overdue',
      value: s?.overdue,
      hint: 'First reply or resolution',
      to: supportBy('overdue'),
    },
    { label: 'Escalated', value: s?.escalated, to: supportBy('escalated') },
    {
      label: 'Satisfaction',
      value: s ? (s.satisfaction === null ? '—' : `${s.satisfaction.toFixed(1)} / 5`) : undefined,
      hint: s ? `${s.ratings} rating${s.ratings === 1 ? '' : 's'}` : undefined,
      to: supportBy('closed'),
    },
  ];
});

const filtered = computed(
  () =>
    [debouncedSearch, priority, category, school, assignee].some((f) => !!f.value) ||
    !!created.value.from,
);
const empty = computed(() =>
  view.value === 'mine' && !filtered.value
    ? {
        title: "You don't have any assigned tickets",
        text: 'Tickets assigned to you appear here.',
      }
    : filtered.value
      ? {
          title: 'No tickets match your filters',
          text: 'Try clearing a filter or searching for something else.',
        }
      : { title: "You're all caught up", text: 'There are no tickets in this view.' },
);
function clearFilters() {
  [search, priority, category, school, assignee].forEach((f) => (f.value = ''));
  created.value = {};
}

const { assignAction } = useIssueActions();
const actions = (issue: SupportIssue): RowAction[] => [
  {
    label: 'View ticket',
    icon: EyeIcon,
    to: { name: routesPath.support.detail.name, params: { id: issue.id } },
  },
  ...[assignAction(issue)]
    .filter((a) => !!a)
    .map((a) => ({ label: a.label, icon: UserPlusIcon, onSelect: a.run })),
  {
    label: 'View school',
    icon: SchoolIcon,
    to: { name: routesPath.schools.detail.name, params: { id: issue.schoolId } },
  },
];

/** The clock that matters now: the first reply until it's sent, then resolution. */
function slaCell(i: SupportIssue) {
  const { firstReply, resolution } = i.sla;
  const clock =
    !isDone(i.status) && firstReply.state !== 'met'
      ? { ...firstReply, label: `Reply · ${firstReply.label.toLowerCase()}` }
      : resolution;
  return { label: clock.label, tone: SLA_TONE[clock.state] };
}

const columns: Column[] = [
  { key: 'id', label: 'Ticket', width: '96px' },
  { key: 'subject', label: 'Subject', width: 'minmax(220px,2fr)' },
  { key: 'schoolName', label: 'School', width: 'minmax(150px,1.2fr)' },
  { key: 'priority', label: 'Priority', width: '96px' },
  { key: 'assignee', label: 'Owner', width: 'minmax(140px,1fr)' },
  { key: 'status', label: 'Status', width: '150px' },
  { key: 'sla', label: 'SLA', width: 'minmax(170px,1fr)' },
  { key: 'updatedAt', label: 'Updated' },
];
</script>

<template>
  <PageHeader
    title="Support"
    description="Issues raised by schools, with each school's context alongside"
  >
    <template #actions>
      <Button as-child
        ><RouterLink :to="{ name: routesPath.support.create.name }"
          >Create issue</RouterLink
        ></Button
      >
    </template>
  </PageHeader>
  <MetricGrid
    ><MetricCard v-for="m in metrics" :key="m.label" v-bind="m" :loading="!summary"
  /></MetricGrid>
  <SupportCharts v-if="summary" :summary="summary" />
  <Skeleton v-else class="h-44" />
  <TabNav :tabs="tabs" label="Ticket views" />

  <DataTable
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(i) => i.id"
    :row-label="(i) => i.id"
    :actions="actions"
    :loading="isPending"
    :meta="data?.meta"
    min-width="1100px"
    :empty-text="`${empty.title}. ${empty.text}`"
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search subject, ID or school"
    /></template>
    <template #filters>
      <FilterMenu v-model="priority" label="Priority" :options="ISSUE_PRIORITIES" />
      <FilterMenu v-model="category" label="Category" :options="ISSUE_CATEGORIES" />
      <FilterMenu v-model="school" label="School" :options="schoolNames" />
      <FilterMenu
        v-model="assignee"
        label="Owner"
        :options="['Unassigned', ...SUPPORT_AGENT_NAMES]"
      />
      <DateRangeFilter v-model="created" label="Created" />
      <Button v-if="filtered" variant="ghost" class="h-9 text-primary" @click="clearFilters"
        >Clear</Button
      >
    </template>
    <template #cell-id="{ row }"
      ><CellLink
        :to="{ name: routesPath.support.detail.name, params: { id: row.id } }"
        :label="row.id"
    /></template>
    <template #cell-subject="{ row }">
      <span class="font-medium">{{ row.subject }}</span>
      <span class="text-xs text-faint">{{ row.requester }}</span>
    </template>
    <template #cell-priority="{ row }"
      ><StatusBadge :label="row.priority" :tone="ISSUE_PRIORITY_TONE[row.priority]"
    /></template>
    <template #cell-assignee="{ row }">
      <span :class="!row.assignee && 'text-warning-strong'">{{
        row.assignee ?? 'Unassigned'
      }}</span>
      <span class="text-xs text-faint">{{ row.assignee ? row.team : `${row.team} queue` }}</span>
    </template>
    <template #cell-sla="{ row }"><StatusBadge v-bind="slaCell(row)" /></template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="ISSUE_STATUS_TONE[row.status]"
    /></template>
  </DataTable>
</template>
