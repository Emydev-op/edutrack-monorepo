<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Switch } from '@edutrack/ui/components/switch';
import { ArrowRightLeftIcon, BedDoubleIcon, EyeIcon, LogOutIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { formatCount } from '@edutrack/app-kit/lib/format';

import {
  useBoardersQuery,
  useBoardingSettingsQuery,
  useHostelsQuery,
  useUnplaceMutation,
} from '@/api/services/boarding';
import { routesPath } from '@/router/routes-path';
import type { BoarderRow } from '@/types';

import { boardingLevels, placeLabel } from './boarding-format';
import PlaceBoarderDialog, { type PlaceTarget } from './PlaceBoarderDialog.vue';

/**
 * Every boarder this session with their hostel, room and bed, or "Needs a place". Boarders are
 * placed and moved one at a time here, or many at once with a hostel's Auto-allocate.
 */
const confirm = useConfirm();
const { data: settings } = useBoardingSettingsQuery();
const { data: hostelList } = useHostelsQuery();
const unplace = useUnplaceMutation();

const campusId = useRouteQuery<string>('campus', '');
const hostelId = useRouteQuery<string>('hostel', '');
const levelId = useRouteQuery<string>('class', '');
const unplaced = useRouteQuery<string>('unplaced', '');
const q = useRouteQuery<string>('q', '');
const search = ref(q.value);
const debounced = refDebounced(search, 300);
watch(debounced, (v) => (q.value = v.trim()));

const { data, isPending, isError, refetch } = useBoardersQuery(() => ({
  branchId: campusId.value || undefined,
  hostelId: hostelId.value || undefined,
  levelId: levelId.value || undefined,
  unplaced: unplaced.value ? true : undefined,
  q: q.value || undefined,
}));
const rows = computed(() => data.value?.boarders ?? []);
const filtered = computed(
  () => !!(campusId.value || hostelId.value || levelId.value || unplaced.value || q.value),
);

/* Filters show names; the URL keeps ids. */
const campuses = computed(() =>
  (settings.value?.campuses ?? []).filter((c) => c.sections.some((s) => s.boarding)),
);
const hostels = computed(() =>
  (hostelList.value?.hostels ?? []).filter((h) => !campusId.value || h.branchId === campusId.value),
);
const levels = computed(() => {
  const list = campuses.value
    .filter((c) => !campusId.value || c.branchId === campusId.value)
    .flatMap((c) => boardingLevels(c));
  return list.filter((l, i) => list.findIndex((x) => x.id === l.id) === i);
});
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
const levelName = computed({
  get: () => levels.value.find((l) => l.id === levelId.value)?.name ?? '',
  set: (name: string) => (levelId.value = levels.value.find((l) => l.name === name)?.id ?? ''),
});
const needsPlace = computed({
  get: () => !!unplaced.value,
  set: (on: boolean) => (unplaced.value = on ? '1' : ''),
});
// A hostel or class from another campus is cleared when the campus changes.
watch(campusId, () => {
  if (hostelId.value && !hostels.value.some((h) => h.id === hostelId.value)) hostelId.value = '';
  if (levelId.value && !levels.value.some((l) => l.id === levelId.value)) levelId.value = '';
});

/* Placing, moving and taking out. */
const placeOpen = ref(false);
const target = ref<PlaceTarget | null>(null);
function openPlace(r: BoarderRow) {
  target.value = {
    studentId: r.studentId,
    name: r.name,
    gender: r.gender,
    branchId: r.branchId,
    campus: r.campus,
    place: r.place,
  };
  placeOpen.value = true;
}
function takeOut(r: BoarderRow) {
  const p = r.place;
  if (!p) return;
  void confirm({
    title: `Take ${r.name} out of ${p.room}?`,
    description: `${r.name} stays a boarder and shows as “Needs a place” until you place them again.`,
    details: [['Now in', placeLabel(p)]],
    confirmLabel: 'Take out of room',
    tone: 'destructive',
    action: async () => {
      await unplace.mutateAsync(r.studentId);
      toast.success(`${r.name} taken out of ${p.room}.`);
    },
  });
}

const studentLink = (r: BoarderRow) => ({
  name: routesPath.students.boarding.name,
  params: { id: r.studentId },
});
const actions = (r: BoarderRow): RowAction[] => [
  r.place
    ? { label: 'Move', icon: ArrowRightLeftIcon, onSelect: () => openPlace(r) }
    : { label: 'Place', icon: BedDoubleIcon, onSelect: () => openPlace(r) },
  { label: 'View student', icon: EyeIcon, to: studentLink(r) },
  ...(r.place
    ? [
        {
          label: 'Take out of room',
          icon: LogOutIcon,
          destructive: true,
          onSelect: () => takeOut(r),
        },
      ]
    : []),
];

const columns: Column[] = [
  { key: 'name', label: 'Boarder', width: 'minmax(200px,1.4fr)' },
  { key: 'className', label: 'Class', width: 'minmax(110px,0.8fr)' },
  { key: 'gender', label: 'Gender', width: '80px' },
  { key: 'place', label: 'Hostel · room · bed', width: 'minmax(220px,1.6fr)' },
];
</script>

<template>
  <PageHeader
    title="Boarders"
    :description="`${data?.session ?? ''}${data?.session ? ' · ' : ''}Students boarding this session and where they sleep.`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.boarding.hostels.name }">Hostels</RouterLink></Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.list.name }"
          >Make students boarders</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="settings && !settings.enabled"
    tone="warning"
    title="Boarding isn’t switched on"
    description="Choose which sections take boarders at each campus first."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.boarding.setup.name }"
          >Go to Boarding set-up</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="Boarders couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <MetricGrid>
    <MetricCard
      label="Boarders"
      :value="formatCount(data?.totals.boarders ?? 0)"
      :loading="isPending"
    />
    <MetricCard
      label="Placed"
      :value="formatCount(data?.totals.placed ?? 0)"
      :loading="isPending"
    />
    <MetricCard
      label="Needs a place"
      :value="formatCount(data?.totals.unplaced ?? 0)"
      :loading="isPending"
      :hint="
        data?.totals.unplaced
          ? 'Place them, or use a hostel’s Auto-allocate'
          : 'Everyone has a room'
      "
      :hint-tone="data?.totals.unplaced ? 'warning' : 'success'"
    />
  </MetricGrid>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(r) => r.studentId"
    :row-label="(r) => r.name"
    :actions="actions"
    :loading="isPending"
    min-width="760px"
    :empty-text="
      filtered
        ? 'No boarders match your filters. Try clearing a filter.'
        : 'No boarders yet. Make students boarders from the Students list or their record.'
    "
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search name or admission number"
    /></template>
    <template #filters>
      <FilterMenu
        v-if="campuses.length > 1"
        v-model="campusName"
        label="Campus"
        :options="campuses.map((c) => c.name)"
      />
      <FilterMenu v-model="hostelName" label="Hostel" :options="hostels.map((h) => h.name)" />
      <FilterMenu v-model="levelName" label="Class" :options="levels.map((l) => l.name)" />
      <label class="flex h-9 shrink-0 items-center gap-2 text-[13px] whitespace-nowrap"
        ><Switch v-model="needsPlace" />Needs a place</label
      >
    </template>
    <template #cell-name="{ row }">
      <CellLink :to="studentLink(row)" :label="row.name" />
      <span class="text-xs text-faint"
        >{{ row.admissionNo }}{{ campuses.length > 1 ? ` · ${row.campus}` : '' }}</span
      >
    </template>
    <template #cell-place="{ row }">
      <span v-if="row.place">{{ placeLabel(row.place) }}</span>
      <button
        v-else
        type="button"
        class="text-left font-medium text-warning-strong hover:underline"
        @click="openPlace(row)"
      >
        Needs a place
      </button>
    </template>
  </DataTable>

  <PlaceBoarderDialog v-model:open="placeOpen" :student="target" />
</template>
