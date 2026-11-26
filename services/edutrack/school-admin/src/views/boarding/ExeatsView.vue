<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import {
  BanIcon,
  CalendarRangeIcon,
  CheckIcon,
  EyeIcon,
  LogInIcon,
  PlusIcon,
  UserIcon,
  XIcon,
} from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import DateRangeFilter, {
  type DateRangeValue,
} from '@edutrack/app-kit/components/common/DateRangeFilter.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useBoardingSettingsQuery, useHostelsQuery } from '@/api/services/boarding';
import { useExeatsQuery } from '@/api/services/boarding-house';
import { routesPath } from '@/router/routes-path';
import type { Exeat } from '@/types';

import ExeatDetailSheet from './ExeatDetailSheet.vue';
import GiveExeatDialog from './GiveExeatDialog.vue';
import { boardingCampuses, exeatBadge, pickupLabel, studentPlace } from './house-format';
import TermBreakDialog from './TermBreakDialog.vue';
import { useExeatActions } from './use-exeat-actions';

/**
 * Every exeat: parents’ requests to decide, approved leave waiting at the gate, boarders out
 * (overdue first to the eye) and returns. The office gives exeats here too, one boarder at a
 * time or the whole campus for a term break.
 */
type Tab = 'Requested' | 'Approved' | 'Out' | 'Overdue' | 'Returned' | 'all';

const { data: settings } = useBoardingSettingsQuery();
const { data: hostelList } = useHostelsQuery();
const actions = useExeatActions();

const tab = useRouteQuery<Tab>('status', 'Requested');
const campusId = useRouteQuery<string>('campus', '');
const hostelId = useRouteQuery<string>('hostel', '');
const from = useRouteQuery<string>('from', '');
const to = useRouteQuery<string>('to', '');
const q = useRouteQuery<string>('q', '');
const search = ref(q.value);
const debounced = refDebounced(search, 300);
watch(debounced, (v) => (q.value = v.trim()));

const range = computed<DateRangeValue>({
  get: () => ({ from: from.value || undefined, to: to.value || undefined }),
  set: (v) => {
    from.value = v.from ?? '';
    to.value = v.to ?? '';
  },
});

const { data, isPending, isError, refetch } = useExeatsQuery(() => ({
  // Overdue is an Out exeat past its return time.
  status: tab.value === 'all' ? undefined : tab.value === 'Overdue' ? 'Out' : tab.value,
  branchId: campusId.value || undefined,
  hostelId: hostelId.value || undefined,
  q: q.value || undefined,
  from: from.value || undefined,
  to: to.value || undefined,
}));
const rows = computed(() => {
  const list = data.value?.exeats ?? [];
  if (tab.value === 'Overdue') return list.filter((e) => e.overdue);
  // Overdue boarders lead the Out list.
  if (tab.value === 'Out') return [...list].sort((a, b) => Number(b.overdue) - Number(a.overdue));
  return list;
});
const totals = computed(() => data.value?.totals);
const tabs = computed<{ value: Tab; label: string }[]>(() => {
  const n = (v?: number) => (v ? ` (${v})` : '');
  return [
    { value: 'Requested', label: `Requested${n(totals.value?.requested)}` },
    { value: 'Approved', label: 'Approved' },
    { value: 'Out', label: `Out${n(totals.value?.out)}` },
    { value: 'Overdue', label: `Overdue${n(totals.value?.overdue)}` },
    { value: 'Returned', label: 'Returned' },
    { value: 'all', label: 'All' },
  ];
});
const filtered = computed(
  () => !!(campusId.value || hostelId.value || q.value || from.value || to.value),
);

/* Filters show names; the URL keeps ids. */
const campuses = computed(() => boardingCampuses(settings.value));
const hostels = computed(() =>
  (hostelList.value?.hostels ?? []).filter((h) => !campusId.value || h.branchId === campusId.value),
);
const campusName = computed({
  get: () => campuses.value.find((c) => c.branchId === campusId.value)?.name ?? '',
  set: (name: string) => {
    campusId.value = campuses.value.find((c) => c.name === name)?.branchId ?? '';
  },
});
const hostelName = computed({
  get: () => hostels.value.find((h) => h.id === hostelId.value)?.name ?? '',
  set: (name: string) => (hostelId.value = hostels.value.find((h) => h.name === name)?.id ?? ''),
});
watch(campusId, () => {
  if (hostelId.value && !hostels.value.some((h) => h.id === hostelId.value)) hostelId.value = '';
});

/* Dialogs and the detail sheet. */
const giveOpen = ref(false);
const termOpen = ref(false);
const detailOpen = ref(false);
const selected = ref<Exeat | null>(null);
function view(e: Exeat) {
  selected.value = e;
  detailOpen.value = true;
}

const rowActions = (e: Exeat): RowAction[] => [
  { label: 'View details', icon: EyeIcon, onSelect: () => view(e) },
  ...(e.status === 'Requested'
    ? [
        { label: 'Approve', icon: CheckIcon, onSelect: () => void actions.approve(e) },
        { label: 'Decline', icon: XIcon, onSelect: () => void actions.decline(e) },
      ]
    : []),
  ...(e.status === 'Out'
    ? [{ label: 'Sign back in', icon: LogInIcon, onSelect: () => void actions.signIn(e) }]
    : []),
  {
    label: 'View student',
    icon: UserIcon,
    to: { name: routesPath.students.boarding.name, params: { id: e.student.id } },
  },
  ...(e.status === 'Requested' || e.status === 'Approved'
    ? [
        {
          label: 'Cancel exeat',
          icon: BanIcon,
          destructive: true,
          onSelect: () => void actions.cancel(e),
        },
      ]
    : []),
];

const columns: Column[] = [
  { key: 'student', label: 'Boarder', width: 'minmax(200px,1.5fr)' },
  { key: 'kind', label: 'Kind', width: 'minmax(110px,0.7fr)' },
  { key: 'dates', label: 'Leaves → back by', width: 'minmax(180px,1.2fr)' },
  { key: 'pickup', label: 'Collected by', width: 'minmax(150px,1fr)' },
  { key: 'status', label: 'Status', width: '130px' },
];

const emptyText = computed(() => {
  if (filtered.value) return 'No exeats match your filters. Try clearing a filter.';
  switch (tab.value) {
    case 'Requested':
      return 'No requests waiting. Parents ask for exeats from the Parent Portal.';
    case 'Overdue':
      return 'Nobody is overdue. Every boarder out is within their time.';
    case 'Out':
      return 'No boarder is out on exeat right now.';
    default:
      return 'No exeats here yet.';
  }
});
</script>

<template>
  <PageHeader title="Exeats" description="Leave for boarders: requests, approvals and who is out.">
    <template #actions>
      <Button variant="outline" @click="termOpen = true"><CalendarRangeIcon />Term break</Button>
      <Button @click="giveOpen = true"><PlusIcon />Give exeat</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="totals?.overdue"
    tone="error"
    :title="`${totals.overdue} ${totals.overdue === 1 ? 'boarder is' : 'boarders are'} overdue`"
    description="They should be back by now. Call whoever collected them."
  >
    <template v-if="tab !== 'Overdue'" #action>
      <Button variant="outline" size="sm" @click="tab = 'Overdue'">Show overdue</Button>
    </template>
  </InlineNotice>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="Exeats couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <div class="overflow-x-auto pb-1">
    <SegmentedControl v-model="tab" :options="tabs" label="Exeat status" />
  </div>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(r) => r.id"
    :row-label="(r) => `${r.student.name} ${r.kind}`"
    :actions="rowActions"
    :loading="isPending"
    min-width="860px"
    :empty-text="emptyText"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search boarder or admission number"
    /></template>
    <template #filters>
      <FilterMenu
        v-if="campuses.length > 1"
        v-model="campusName"
        label="Campus"
        :options="campuses.map((c) => c.name)"
      />
      <FilterMenu v-model="hostelName" label="Hostel" :options="hostels.map((h) => h.name)" />
      <DateRangeFilter v-model="range" label="Leaving" />
    </template>
    <template #cell-student="{ row }">
      <button
        type="button"
        class="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
        @click="view(row)"
      >
        {{ row.student.name }}
      </button>
      <span class="text-xs text-faint"
        >{{ row.student.admissionNo }} · {{ studentPlace(row.student) }}</span
      >
    </template>
    <template #cell-kind="{ row }">
      <span>{{ row.kind }}</span>
      <span class="text-xs text-faint">{{
        row.requestedBy === 'Parent' ? 'Parent asked' : 'School'
      }}</span>
    </template>
    <template #cell-dates="{ row }">
      <span class="tabular-nums">{{ row.leaves }}</span>
      <span
        class="text-xs tabular-nums"
        :class="row.overdue ? 'font-medium text-error-strong' : 'text-faint'"
        >back by {{ row.returns }}</span
      >
    </template>
    <template #cell-pickup="{ row }">
      <span>{{ pickupLabel(row) }}</span>
      <span v-if="row.collectedBy" class="text-xs text-faint"
        >Collected: {{ row.collectedBy }}</span
      >
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="exeatBadge(row).label" :tone="exeatBadge(row).tone" />
    </template>
  </DataTable>

  <GiveExeatDialog v-model:open="giveOpen" />
  <TermBreakDialog v-model:open="termOpen" />
  <ExeatDetailSheet v-model:open="detailOpen" :exeat="selected" />
</template>
