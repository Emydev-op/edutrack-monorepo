<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { messageOf } from '@edutrack/web-core/http';
import { CheckIcon, PlusIcon, Trash2Icon, UserIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useHostelsQuery } from '@/api/services/boarding';
import {
  useCloseIncidentMutation,
  useIncidentsQuery,
  useRemoveVisitingDayMutation,
  useVisitingDaysQuery,
} from '@/api/services/boarding-house';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';
import type { Incident, VisitingDay } from '@/types';

import ChecklistEditor from './ChecklistEditor.vue';
import { dayLabel, lagosToday } from './house-format';
import IncidentDialog from './IncidentDialog.vue';
import VisitingDayDialog from './VisitingDayDialog.vue';

/** House life: visiting days for parents, hostel incidents, and the property checklist. */
type Tab = 'visiting' | 'incidents' | 'property';
const tab = useRouteQuery<Tab>('tab', 'visiting');
const TABS: { value: Tab; label: string }[] = [
  { value: 'visiting', label: 'Visiting days' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'property', label: 'Property checklist' },
];
const confirm = useConfirm();
const can = useCan();

/* ---------------- Visiting days ---------------- */

const {
  data: visitingDays,
  isPending: daysPending,
  isError: daysError,
  refetch: refetchDays,
} = useVisitingDaysQuery();
const removeDay = useRemoveVisitingDayMutation();
const dayOpen = ref(false);
const today = lagosToday();
const upcoming = computed(() =>
  [...(visitingDays.value ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
);
const multiCampus = computed(() => new Set(upcoming.value.map((d) => d.campus)).size > 1);

function removeVisitingDay(d: VisitingDay) {
  void confirm({
    title: `Remove the visiting day on ${dayLabel(d.date)}?`,
    description: 'Parents no longer see it. Tell them yourself if it was already announced.',
    details: [
      ['Campus', d.campus],
      ['Time', `${d.startsAt} – ${d.endsAt}`],
    ],
    confirmLabel: 'Remove',
    tone: 'destructive',
    action: async () => {
      await removeDay.mutateAsync(d.id);
      toast.success(`Visiting day on ${dayLabel(d.date)} removed.`);
    },
  });
}

/* ---------------- Incidents ---------------- */

const status = useRouteQuery<string>('status', 'Open');
const hostelId = useRouteQuery<string>('hostel', '');
const { data: hostelList } = useHostelsQuery();
const {
  data: incidentList,
  isPending: incidentsPending,
  isError: incidentsError,
  refetch: refetchIncidents,
} = useIncidentsQuery(
  () => ({
    status: status.value === 'all' ? undefined : status.value,
    hostelId: hostelId.value || undefined,
  }),
  () => tab.value === 'incidents',
);
const closeIncident = useCloseIncidentMutation();
const incidentOpen = ref(false);
const hostels = computed(() => hostelList.value?.hostels ?? []);
const hostelName = computed({
  get: () => hostels.value.find((h) => h.id === hostelId.value)?.name ?? '',
  set: (name: string) => (hostelId.value = hostels.value.find((h) => h.name === name)?.id ?? ''),
});
watch(hostels, (list) => {
  if (hostelId.value && list.length && !list.some((h) => h.id === hostelId.value))
    hostelId.value = '';
});

function close(i: Incident) {
  void confirm({
    title: `Close this incident for ${i.student.name}?`,
    description: `${i.category} · ${i.when}`,
    details: [['What happened', i.description]],
    input: {
      label: 'Action taken',
      placeholder: i.action ? `Now: ${i.action}` : 'Optional, e.g. Apologised to the prefect',
    },
    confirmLabel: 'Close incident',
    action: async ({ text }) => {
      const r = await closeIncident.mutateAsync({ id: i.id, action: text.trim() || undefined });
      toast.success(messageOf(r, 'Incident closed.'));
    },
  });
}

const incidentActions = (i: Incident): RowAction[] => [
  ...(i.status === 'Open' && can('boarding.rollcall')
    ? [{ label: 'Close', icon: CheckIcon, onSelect: () => close(i) }]
    : []),
  {
    label: 'View student',
    icon: UserIcon,
    to: { name: routesPath.students.boarding.name, params: { id: i.student.id } },
  },
];
const incidentColumns: Column[] = [
  { key: 'student', label: 'Boarder', width: 'minmax(180px,1.1fr)' },
  { key: 'when', label: 'When', width: 'minmax(130px,0.7fr)' },
  { key: 'category', label: 'Category', width: 'minmax(120px,0.7fr)' },
  { key: 'description', label: 'What happened', width: 'minmax(220px,1.8fr)' },
  { key: 'status', label: 'Status', width: '120px' },
];
</script>

<template>
  <PageHeader
    title="House"
    description="Visiting days, hostel incidents and the property checklist."
  >
    <template #actions>
      <Button v-if="tab === 'visiting' && can('boarding.manage')" @click="dayOpen = true"
        ><PlusIcon />Add visiting day</Button
      >
      <Button
        v-else-if="tab === 'incidents' && can('boarding.rollcall')"
        @click="incidentOpen = true"
        ><PlusIcon />Record incident</Button
      >
    </template>
  </PageHeader>

  <div class="overflow-x-auto pb-1">
    <SegmentedControl v-model="tab" :options="TABS" label="House section" />
  </div>

  <!-- Visiting days -->
  <template v-if="tab === 'visiting'">
    <InlineNotice
      v-if="daysError"
      tone="error"
      title="Visiting days couldn’t load"
      description="Check your connection and try again."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="refetchDays()">Retry</Button></template
      >
    </InlineNotice>
    <SectionCard
      title="Visiting days"
      description="Days parents may visit boarders. Parents are told when you add one."
      flush
    >
      <Skeleton v-if="daysPending" class="m-4 h-20" />
      <p v-else-if="!upcoming.length" class="px-4 py-6 text-[13px] text-muted-foreground">
        No visiting days yet. Add one so parents can plan.
      </p>
      <ul v-else>
        <li
          v-for="d in upcoming"
          :key="d.id"
          class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 last:border-b-0"
          :class="d.date < today && 'opacity-60'"
        >
          <span class="flex min-w-0 flex-col text-[13px]">
            <span class="font-medium"
              >{{ dayLabel(d.date) }}
              <span class="font-normal text-muted-foreground tabular-nums"
                >· {{ d.startsAt }} – {{ d.endsAt }}</span
              ></span
            >
            <span v-if="multiCampus || d.note" class="text-xs text-muted-foreground">{{
              [multiCampus ? d.campus : '', d.note].filter(Boolean).join(' · ')
            }}</span>
            <span v-if="d.date < today" class="text-xs text-faint">Past</span>
          </span>
          <Button
            v-if="can('boarding.manage')"
            variant="ghost"
            size="icon"
            :aria-label="`Remove the visiting day on ${dayLabel(d.date)}`"
            @click="removeVisitingDay(d)"
            ><Trash2Icon
          /></Button>
        </li>
      </ul>
    </SectionCard>
  </template>

  <!-- Incidents -->
  <template v-else-if="tab === 'incidents'">
    <InlineNotice
      v-if="incidentsError"
      tone="error"
      title="Incidents couldn’t load"
      description="Check your connection and try again."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="refetchIncidents()">Retry</Button></template
      >
    </InlineNotice>
    <DataTable
      :columns="incidentColumns"
      :rows="incidentList?.incidents ?? []"
      :row-key="(r) => r.id"
      :row-label="(r) => `${r.student.name} ${r.category}`"
      :actions="incidentActions"
      :loading="incidentsPending"
      min-width="860px"
      :empty-text="
        status === 'Open' ? 'No open incidents. All quiet in the hostels.' : 'No incidents here.'
      "
    >
      <template #filters>
        <SegmentedControl
          v-model="status"
          :options="[
            { value: 'Open', label: 'Open' },
            { value: 'Closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]"
          label="Incident status"
        />
        <FilterMenu v-model="hostelName" label="Hostel" :options="hostels.map((h) => h.name)" />
      </template>
      <template #cell-student="{ row }">
        <CellLink
          :to="{ name: routesPath.students.boarding.name, params: { id: row.student.id } }"
          :label="row.student.name"
        />
        <span class="text-xs text-faint"
          >{{ row.student.admissionNo }}{{ row.hostel ? ` · ${row.hostel}` : '' }}</span
        >
      </template>
      <template #cell-when="{ row }">
        <span class="tabular-nums">{{ row.when }}</span>
        <span v-if="row.reportedBy" class="text-xs text-faint">{{ row.reportedBy }}</span>
      </template>
      <template #cell-description="{ row }">
        <span>{{ row.description }}</span>
        <span v-if="row.action" class="text-xs text-muted-foreground"
          >Action: {{ row.action }}</span
        >
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :label="row.status" />
        <span v-if="row.sharedWithParent" class="text-xs text-faint">Shared with parents</span>
      </template>
    </DataTable>
  </template>

  <ChecklistEditor v-else />

  <VisitingDayDialog v-model:open="dayOpen" />
  <IncidentDialog v-model:open="incidentOpen" :categories="incidentList?.categories ?? []" />
</template>
