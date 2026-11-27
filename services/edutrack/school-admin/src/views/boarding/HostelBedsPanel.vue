<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowRightLeftIcon, BedDoubleIcon, LogOutIcon, SparklesIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import RowActions, { type RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { pluralize } from '@edutrack/app-kit/lib/format';

import {
  useAutoAllocateMutation,
  useHostelOccupancyQuery,
  useUnplaceMutation,
} from '@/api/services/boarding';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';
import type { Hostel, OccupancyRoom, RoomOccupant } from '@/types';

import PlaceBoarderDialog, { type PlaceTarget } from './PlaceBoarderDialog.vue';

/**
 * A hostel's beds this session: each room with who sleeps there and the places still free.
 * Boarders can be moved or taken out, and waiting boarders placed in one go (Auto-allocate).
 */
const props = defineProps<{ hostel: Hostel }>();

const confirm = useConfirm();
const can = useCan();
const { data, isPending, isError, error, refetch } = useHostelOccupancyQuery(() => props.hostel.id);
const autoAllocate = useAutoAllocateMutation();
const unplace = useUnplaceMutation();

interface Group {
  id: string;
  name: string | null;
  rooms: OccupancyRoom[];
  taken: number;
  places: number;
}
const groups = computed<Group[]>(() => {
  const o = data.value;
  if (!o) return [];
  const make = (id: string, name: string | null, rooms: OccupancyRoom[]): Group => ({
    id,
    name,
    rooms,
    taken: rooms.reduce((n, r) => n + r.taken, 0),
    places: rooms.reduce((n, r) => n + r.capacity, 0),
  });
  const list = o.floors.map((f) =>
    make(
      f.id,
      f.name,
      o.rooms.filter((r) => r.floorId === f.id),
    ),
  );
  const loose = o.rooms.filter((r) => !r.floorId || !o.floors.some((f) => f.id === r.floorId));
  if (loose.length) list.push(make('none', o.floors.length ? 'No floor' : null, loose));
  return list.filter((g) => g.rooms.length);
});

/** The labelled beds nobody sleeps in, or how many unlabelled places are free. */
const freeBeds = (r: OccupancyRoom) => r.beds.filter((b) => !r.occupants.some((o) => o.bed === b));

const placeOpen = ref(false);
const moving = ref<PlaceTarget | null>(null);
function move(r: OccupancyRoom, o: RoomOccupant) {
  const d = data.value!;
  moving.value = {
    studentId: o.studentId,
    name: o.name,
    gender: o.gender,
    branchId: props.hostel.branchId,
    campus: d.hostel.campus,
    place: {
      hostelId: d.hostel.id,
      hostel: d.hostel.name,
      floor: d.floors.find((f) => f.id === r.floorId)?.name ?? null,
      roomId: r.id,
      room: r.name,
      bed: o.bed,
    },
  };
  placeOpen.value = true;
}

function takeOut(r: OccupancyRoom, o: RoomOccupant) {
  void confirm({
    title: `Take ${o.name} out of ${r.name}?`,
    description: `${o.name} stays a boarder and shows as “Needs a place” until you place them again.`,
    details: [
      ['Room', `${r.name}${o.bed ? ` · bed ${o.bed}` : ''}`],
      ['Class', o.className],
    ],
    confirmLabel: 'Take out of room',
    tone: 'destructive',
    action: async () => {
      await unplace.mutateAsync(o.studentId);
      toast.success(`${o.name} taken out of ${r.name}.`);
    },
  });
}

const occupantActions = (r: OccupancyRoom, o: RoomOccupant): RowAction[] => [
  {
    label: 'View student',
    to: { name: routesPath.students.boarding.name, params: { id: o.studentId } },
  },
  ...(can('boarding.manage')
    ? [
        { label: 'Move', icon: ArrowRightLeftIcon, onSelect: () => move(r, o) },
        {
          label: 'Take out of room',
          icon: LogOutIcon,
          destructive: true,
          onSelect: () => takeOut(r, o),
        },
      ]
    : []),
];

function runAutoAllocate() {
  const h = props.hostel;
  void confirm({
    title: `Auto-allocate ${h.name}?`,
    description:
      'Boarders at this campus who need a place are put in this hostel’s free beds. Boarders already placed don’t move.',
    options: [
      {
        value: 'together',
        label: 'Keep classmates together',
        description: 'Fill rooms class by class, so classmates share rooms.',
      },
      {
        value: 'mix',
        label: 'Mix classes',
        description: 'Spread each class across the rooms.',
      },
    ],
    confirmLabel: 'Auto-allocate',
    action: async ({ option }) => {
      const result = await autoAllocate.mutateAsync({
        hostelId: h.id,
        keepClassmates: option === 'together',
      });
      const text = `${result.placed} placed, ${result.waiting} still waiting.`;
      if (result.placed) toast.success(text);
      else toast.info(text);
    },
  }).catch((e: unknown) => toast.error(getApiErrorMessage(e)));
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="The beds couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <SectionCard
    v-else
    :title="`Beds · ${data.session}`"
    :description="`${pluralize(data.totals.taken, 'place')} taken · ${pluralize(data.totals.free, 'place')} free of ${data.totals.places}`"
  >
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{
              name: routesPath.boarding.boarders.name,
              query: { campus: hostel.branchId, unplaced: '1' },
            }"
            >Boarders who need a place</RouterLink
          ></Button
        >
        <Button
          v-if="can('boarding.manage')"
          size="sm"
          :disabled="!data.totals.free || autoAllocate.isPending.value"
          @click="runAutoAllocate"
          ><SparklesIcon />Auto-allocate</Button
        >
      </div>
    </template>

    <EmptyState
      v-if="!data.rooms.length"
      title="No rooms yet"
      description="Add rooms in the Rooms view first, then place boarders here."
    />

    <div v-else class="flex flex-col gap-4">
      <section
        v-for="g in groups"
        :key="g.id"
        class="flex flex-col gap-2"
        :class="g.name ? 'rounded-md border p-3' : ''"
      >
        <h3 v-if="g.name" class="text-sm font-semibold">
          {{ g.name }}
          <span class="text-xs font-normal text-muted-foreground tabular-nums"
            >· {{ g.taken }} of {{ pluralize(g.places, 'place') }} taken</span
          >
        </h3>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
          <li
            v-for="r in g.rooms"
            :key="r.id"
            class="flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5"
            :class="!r.free && 'bg-muted'"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-[13px] font-medium">{{ r.name }}</span>
              <span
                class="shrink-0 text-xs tabular-nums"
                :class="r.free ? 'text-muted-foreground' : 'font-medium text-warning-strong'"
                >{{ r.taken }}/{{ r.capacity }}{{ r.free ? '' : ' · full' }}</span
              >
            </div>
            <ul v-if="r.occupants.length" class="flex flex-col">
              <li
                v-for="o in r.occupants"
                :key="o.studentId"
                class="-mx-1 flex items-center gap-1 rounded px-1 hover:bg-muted"
              >
                <span class="flex min-w-0 flex-1 flex-col py-0.5">
                  <span class="truncate text-[13px]">{{ o.name }}</span>
                  <span class="truncate text-xs text-muted-foreground"
                    >{{ o.className }}{{ o.bed ? ` · bed ${o.bed}` : '' }}</span
                  >
                </span>
                <RowActions :actions="occupantActions(r, o)" :label="`${o.name} actions`" />
              </li>
            </ul>
            <span v-if="r.free" class="flex items-center gap-1 text-xs text-success-strong">
              <BedDoubleIcon class="size-3.5" aria-hidden="true" />
              {{
                r.beds.length
                  ? `Free: ${freeBeds(r)
                      .map((b) => `bed ${b}`)
                      .join(', ')}`
                  : `${pluralize(r.free, 'free place')}`
              }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </SectionCard>

  <PlaceBoarderDialog v-model:open="placeOpen" :student="moving" :hostel-id="hostel.id" />
</template>
