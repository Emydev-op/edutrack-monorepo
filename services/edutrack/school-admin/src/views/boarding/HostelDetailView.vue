<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { CopyIcon, LayersIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import RowActions, { type RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { formatCount, pluralize } from '@edutrack/app-kit/lib/format';

import {
  useBoardingSettingsQuery,
  useDeleteFloorMutation,
  useDeleteHostelMutation,
  useDeleteRoomMutation,
  useHostelQuery,
} from '@/api/services/boarding';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { Hostel, HostelFloor, HostelRoom, HostelStaff } from '@/types';

import { bedSummary, FLOOR_MASTER, GENDER_TONE, HOUSE_MASTER } from './boarding-format';
import CopyHostelDialog from './CopyHostelDialog.vue';
import FloorDialog from './FloorDialog.vue';
import HostelBedsPanel from './HostelBedsPanel.vue';
import HostelFormDialog from './HostelFormDialog.vue';
import HostelStaffDialog from './HostelStaffDialog.vue';
import RoomDialog from './RoomDialog.vue';
import RoomGeneratorDialog from './RoomGeneratorDialog.vue';

/**
 * One hostel: its house staff, and its floors or wings with their rooms. Rooms are added many at
 * a time with the generator, or one by one. The Beds view shows who sleeps where this session.
 */
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layoutStore = useLayoutStore();
const b = routesPath.boarding;

const id = computed(() => String(route.params.id ?? ''));
const { data: hostel, isPending, isError, error, refetch } = useHostelQuery(id);
const { data: settings } = useBoardingSettingsQuery();
const removeHostel = useDeleteHostelMutation();
const removeFloor = useDeleteFloorMutation();
const removeRoom = useDeleteRoomMutation();

watch(hostel, (h) => layoutStore.setRecordLabel(h?.name ?? null), { immediate: true });

/** Rooms (the layout) or Beds (who sleeps where), kept in the URL. */
const view = useRouteQuery<'rooms' | 'beds'>('view', 'rooms');
const VIEWS = [
  { value: 'rooms' as const, label: 'Rooms' },
  { value: 'beds' as const, label: 'Beds' },
];

/* ---------------- Layout ---------------- */

interface Group {
  floor: HostelFloor | null;
  rooms: HostelRoom[];
  places: number;
  staff: HostelStaff[];
}
const groups = computed<Group[]>(() => {
  const h = hostel.value;
  if (!h) return [];
  const sum = (rooms: HostelRoom[]) => rooms.reduce((n, r) => n + r.capacity, 0);
  const list: Group[] = h.floors.map((f) => {
    const rooms = h.rooms.filter((r) => r.floorId === f.id);
    return { floor: f, rooms, places: sum(rooms), staff: f.staff };
  });
  const loose = h.rooms.filter((r) => !r.floorId || !h.floors.some((f) => f.id === r.floorId));
  if (loose.length || !h.floors.length)
    list.push({ floor: null, rooms: loose, places: sum(loose), staff: [] });
  return list;
});

const staffByRole = computed(() => {
  const h = hostel.value;
  if (!h) return [];
  const order = [HOUSE_MASTER, FLOOR_MASTER, 'Assistant'];
  return [...h.staff].sort((x, y) => order.indexOf(x.role) - order.indexOf(y.role));
});
const floorName = (h: Hostel, floorId: string | null) =>
  h.floors.find((f) => f.id === floorId)?.name ?? '';

/* ---------------- Dialogs ---------------- */

const editOpen = ref(false);
const copyOpen = ref(false);
const staffOpen = ref(false);

const floorOpen = ref(false);
const floorEditing = ref<HostelFloor | null>(null);
function addFloor() {
  floorEditing.value = null;
  floorOpen.value = true;
}
function renameFloor(f: HostelFloor) {
  floorEditing.value = f;
  floorOpen.value = true;
}

const genOpen = ref(false);
const genFloor = ref<string | null>(null);
function generateRooms(floorId: string | null = null) {
  genFloor.value = floorId;
  genOpen.value = true;
}

const roomOpen = ref(false);
const roomEditing = ref<HostelRoom | null>(null);
const roomFloor = ref<string | null>(null);
function addRoom(floorId: string | null = null) {
  roomEditing.value = null;
  roomFloor.value = floorId;
  roomOpen.value = true;
}
function editRoom(r: HostelRoom) {
  roomEditing.value = r;
  roomOpen.value = true;
}

/* ---------------- Removing ---------------- */

function deleteHostel() {
  const h = hostel.value!;
  void confirm({
    title: `Remove ${h.name}?`,
    description: 'Its floors, rooms and house staff are removed too. This can’t be undone.',
    details: [
      ['Campus', h.campus],
      ['Rooms', String(h.totals.rooms)],
      ['Places', String(h.totals.places)],
    ],
    confirmLabel: 'Remove hostel',
    tone: 'destructive',
    action: async () => {
      const result = await removeHostel.mutateAsync(h.id);
      toast.success(messageOf(result, `${h.name} removed.`));
      void router.push({ name: b.hostels.name });
    },
  });
}

function deleteFloor(f: HostelFloor) {
  const h = hostel.value!;
  void confirm({
    title: `Remove ${f.name}?`,
    description: f.rooms
      ? `Its ${pluralize(f.rooms, 'room')} stay in the hostel, without a floor.${f.staff.length ? ' Its floor master / mistress is removed from the house staff.' : ''}`
      : 'It has no rooms.',
    confirmLabel: 'Remove floor',
    tone: 'destructive',
    action: async () => {
      const result = await removeFloor.mutateAsync({ hostelId: h.id, floorId: f.id });
      toast.success(messageOf(result, `${f.name} removed.`));
    },
  });
}

function deleteRoom(r: HostelRoom) {
  const h = hostel.value!;
  void confirm({
    title: `Remove ${r.name}?`,
    details: [
      ['Places', String(r.capacity)],
      ...(r.floorId ? [['Floor', floorName(h, r.floorId)] as [string, string]] : []),
    ],
    confirmLabel: 'Remove room',
    tone: 'destructive',
    action: async () => {
      const result = await removeRoom.mutateAsync({ hostelId: h.id, roomId: r.id });
      toast.success(messageOf(result, `${r.name} removed.`));
    },
  });
}

const floorActions = (f: HostelFloor): RowAction[] => [
  { label: 'Add rooms here', icon: LayersIcon, onSelect: () => generateRooms(f.id) },
  { label: 'Add one room', icon: PlusIcon, onSelect: () => addRoom(f.id) },
  { label: 'Rename', icon: PencilIcon, onSelect: () => renameFloor(f) },
  { label: 'Remove floor', icon: Trash2Icon, destructive: true, onSelect: () => deleteFloor(f) },
];
const roomActions = (r: HostelRoom): RowAction[] => [
  { label: 'Edit room', icon: PencilIcon, onSelect: () => editRoom(r) },
  { label: 'Remove room', icon: Trash2Icon, destructive: true, onSelect: () => deleteRoom(r) },
];

const onCopied = (h: Hostel) => router.push({ name: b.hostel.name, params: { id: h.id } });
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="isError || !hostel"
    tone="error"
    title="This hostel couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action>
      <span class="flex gap-2">
        <Button variant="outline" size="sm" @click="refetch()">Retry</Button>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: b.hostels.name }">All hostels</RouterLink></Button
        >
      </span>
    </template>
  </InlineNotice>

  <template v-else>
    <PageHeader
      :title="hostel.name"
      :description="`${hostel.campus} · ${hostel.levels.join(', ')}`"
      :meta="[
        { label: 'Floors', value: String(hostel.totals.floors) },
        { label: 'Rooms', value: formatCount(hostel.totals.rooms) },
        { label: 'Places', value: formatCount(hostel.totals.places) },
        { label: 'Taken', value: formatCount(hostel.totals.taken) },
        { label: 'Free', value: formatCount(hostel.totals.free) },
      ]"
    >
      <template #actions>
        <Button variant="outline" @click="editOpen = true"><PencilIcon />Edit</Button>
        <Button variant="outline" @click="copyOpen = true"><CopyIcon />Copy layout</Button>
        <Button variant="outline" class="text-destructive" @click="deleteHostel"
          ><Trash2Icon />Remove</Button
        >
      </template>
    </PageHeader>
    <div class="-mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
      <StatusBadge :label="hostel.gender" :tone="GENDER_TONE[hostel.gender]" />
      <span v-if="hostel.note">{{ hostel.note }}</span>
    </div>

    <SectionCard title="House staff" description="Who looks after the boarders here.">
      <template #actions>
        <Button variant="outline" size="sm" @click="staffOpen = true"
          ><UsersIcon />Edit staff</Button
        >
      </template>
      <ul v-if="staffByRole.length" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="s in staffByRole"
          :key="s.id"
          class="flex flex-col rounded-md border px-3 py-2 text-[13px]"
        >
          <span class="flex items-center gap-2 font-medium"
            >{{ s.name }}
            <StatusBadge v-if="!s.active" label="Left" tone="warning" />
          </span>
          <span class="text-xs text-muted-foreground"
            >{{ s.role }}{{ s.floorId ? ` · ${floorName(hostel, s.floorId)}` : '' }}</span
          >
        </li>
      </ul>
      <p v-else class="text-[13px] text-muted-foreground">
        No house master / mistress yet.
        <button
          type="button"
          class="font-medium text-primary hover:underline"
          @click="staffOpen = true"
        >
          Add house staff
        </button>
      </p>
      <InlineNotice
        v-if="hostel.staff.some((s) => !s.active)"
        tone="warning"
        class="mt-3"
        title="Someone here has left the school"
        description="Replace them in Edit staff."
      />
    </SectionCard>

    <SegmentedControl v-model="view" :options="VIEWS" label="Hostel view" />

    <HostelBedsPanel v-if="view === 'beds'" :hostel="hostel" />

    <SectionCard
      v-else
      title="Floors & rooms"
      :description="`${hostel.totals.floors ? `${pluralize(hostel.totals.floors, 'floor or wing', 'floors or wings')} · ` : ''}${pluralize(hostel.totals.rooms, 'room')} · ${pluralize(hostel.totals.places, 'place')}`"
    >
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" @click="addFloor"
            ><PlusIcon />Add floor / wing</Button
          >
          <Button variant="outline" size="sm" @click="addRoom()">Add one room</Button>
          <Button size="sm" @click="generateRooms()"><LayersIcon />Add rooms</Button>
        </div>
      </template>

      <EmptyState
        v-if="!hostel.rooms.length && !hostel.floors.length"
        title="No rooms yet"
        description="One big dormitory? Add 1 room with all its places. Several floors or wings? Add them first, then the rooms on each. Use “Add rooms” to add many at once, e.g. Room 1–10 with 4 places each."
      >
        <div class="flex flex-wrap gap-2">
          <Button size="sm" @click="generateRooms()"><LayersIcon />Add rooms</Button>
          <Button variant="outline" size="sm" @click="addFloor"
            ><PlusIcon />Add floor / wing</Button
          >
        </div>
      </EmptyState>

      <div v-else class="flex flex-col gap-4">
        <section
          v-for="g in groups"
          :key="g.floor?.id ?? 'none'"
          class="flex flex-col gap-2"
          :class="hostel.floors.length ? 'rounded-md border p-3' : ''"
        >
          <header
            v-if="hostel.floors.length"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <div class="flex min-w-0 flex-col">
              <h3 class="text-sm font-semibold">
                {{ g.floor?.name ?? 'No floor' }}
                <span class="text-xs font-normal text-muted-foreground"
                  >· {{ pluralize(g.rooms.length, 'room') }} ·
                  {{ pluralize(g.places, 'place') }}</span
                >
              </h3>
              <span v-if="g.floor" class="text-xs text-muted-foreground">
                {{
                  g.staff.length
                    ? g.staff.map((s) => `${s.name} (${s.role})`).join(', ')
                    : 'No floor master / mistress'
                }}
              </span>
            </div>
            <RowActions
              v-if="g.floor"
              :actions="floorActions(g.floor)"
              :label="`${g.floor.name} actions`"
            />
          </header>

          <ul
            v-if="g.rooms.length"
            class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2"
          >
            <li
              v-for="r in g.rooms"
              :key="r.id"
              class="group relative flex items-start gap-1 rounded-md border bg-card px-2.5 py-2 transition-colors hover:border-primary"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col text-left after:absolute after:inset-0"
                :aria-label="`Edit ${r.name}`"
                @click="editRoom(r)"
              >
                <span class="truncate text-[13px] font-medium">{{ r.name }}</span>
                <span class="text-xs text-muted-foreground tabular-nums"
                  >{{ pluralize(r.capacity, 'place')
                  }}{{ r.taken ? ` · ${r.taken} taken` : '' }}</span
                >
                <span v-if="r.beds.length" class="truncate text-xs text-faint">{{
                  bedSummary(r.beds)
                }}</span>
              </button>
              <span class="relative z-10 -mr-1.5 -mt-1">
                <RowActions :actions="roomActions(r)" :label="`${r.name} actions`" />
              </span>
            </li>
          </ul>
          <p v-else class="text-xs text-muted-foreground">
            No rooms on this floor yet.
            <button
              v-if="g.floor"
              type="button"
              class="font-medium text-primary hover:underline"
              @click="generateRooms(g.floor.id)"
            >
              Add rooms
            </button>
          </p>
        </section>
      </div>
    </SectionCard>

    <HostelFormDialog v-model:open="editOpen" :settings="settings" :hostel="hostel" />
    <CopyHostelDialog v-model:open="copyOpen" :hostel="hostel" @copied="onCopied" />
    <HostelStaffDialog v-model:open="staffOpen" :hostel="hostel" />
    <FloorDialog v-model:open="floorOpen" :hostel="hostel" :floor="floorEditing" />
    <RoomGeneratorDialog v-model:open="genOpen" :hostel="hostel" :floor-id="genFloor" />
    <RoomDialog
      v-model:open="roomOpen"
      :hostel="hostel"
      :room="roomEditing"
      :floor-id="roomFloor"
    />
  </template>
</template>
