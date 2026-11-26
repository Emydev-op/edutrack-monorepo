<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorCode, getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useHostelOccupancyQuery, useHostelsQuery } from '@/api/services/boarding';
import type { BoardingPlace } from '@/types';

import { otherGender, placeLabel } from './boarding-format';
import { useAllocate } from './use-allocate';

/** The boarder being placed or moved. */
export interface PlaceTarget {
  studentId: string;
  name: string;
  gender?: 'Female' | 'Male' | '';
  /** Their campus: the branch id when known, else its name. */
  branchId?: string;
  campus: string;
  place: BoardingPlace | null;
}

/**
 * Places a boarder in a room of one of their campus's hostels, and a bed when the room's beds are
 * labelled. Full rooms and taken beds can't be chosen; a hostel for the other gender or other
 * classes asks "Place anyway?".
 */
const props = defineProps<{
  student: PlaceTarget | null;
  /** The hostel to start with (e.g. from a hostel's Beds view). */
  hostelId?: string;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ placed: [] }>();

const { data: hostelList, isPending: hostelsPending } = useHostelsQuery();
const { place, pending } = useAllocate();

const hostelSel = ref('');
const roomId = ref('');
const bed = ref('');
const fields = ref<Record<string, string>>({});
const serverError = ref('');

const hostels = computed(() => {
  const s = props.student;
  if (!s) return [];
  return (hostelList.value?.hostels ?? []).filter((h) =>
    s.branchId ? h.branchId === s.branchId : h.campus === s.campus,
  );
});
const hostel = computed(() => hostels.value.find((h) => h.id === hostelSel.value));
const { data: occupancy, isFetching: occupancyLoading } = useHostelOccupancyQuery(hostelSel);
const rooms = computed(() =>
  occupancy.value?.hostel.id === hostelSel.value ? occupancy.value.rooms : [],
);
const floorName = (id: string | null) =>
  occupancy.value?.floors.find((f) => f.id === id)?.name ?? '';
const room = computed(() => rooms.value.find((r) => r.id === roomId.value));
const isCurrentRoom = (id: string) => props.student?.place?.roomId === id;
/** A room the student is already in still has their own place. */
const roomFree = (r: { id: string; free: number }) => r.free + (isCurrentRoom(r.id) ? 1 : 0);
const bedTaken = (label: string) =>
  !!room.value?.occupants.some((o) => o.bed === label && o.studentId !== props.student?.studentId);

watch(open, (o) => {
  if (!o) return;
  const s = props.student;
  hostelSel.value = s?.place?.hostelId ?? props.hostelId ?? '';
  roomId.value = s?.place?.roomId ?? '';
  bed.value = s?.place?.bed ?? '';
  fields.value = {};
  serverError.value = '';
});
// The only hostel at the campus is chosen for them.
watch(
  [open, hostels],
  () => {
    if (open.value && !hostelSel.value && hostels.value.length === 1)
      hostelSel.value = hostels.value[0]!.id;
  },
  { immediate: true },
);
function pickHostel(id: string) {
  hostelSel.value = id;
  roomId.value = '';
  bed.value = '';
}
function pickRoom(id: string) {
  roomId.value = id;
  bed.value = '';
}
watch([hostelSel, roomId, bed], () => {
  fields.value = {};
  serverError.value = '';
});

const genderWarning = computed(() =>
  hostel.value && otherGender(hostel.value.gender, props.student?.gender)
    ? `${hostel.value.name} is a ${hostel.value.gender.toLowerCase()}’ hostel.`
    : '',
);

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!hostelSel.value) e.hostelId ??= 'Choose a hostel.';
  else if (!roomId.value) e.roomId ??= 'Choose a room.';
  else if (room.value?.beds.length && !bed.value) e.bed ??= 'Choose a bed.';
  return e;
});
const showErrors = ref(false);
watch(open, () => (showErrors.value = false));
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

const unchanged = computed(() => {
  const p = props.student?.place;
  return !!p && p.roomId === roomId.value && (p.bed ?? '') === bed.value;
});

async function submit() {
  const s = props.student;
  if (!s) return;
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  if (unchanged.value) return void (open.value = false);
  try {
    const result = await place({
      studentId: s.studentId,
      roomId: roomId.value,
      ...(bed.value ? { bed: bed.value } : {}),
    });
    if (!result) return;
    toast.success(
      `${s.name} ${s.place ? 'moved to' : 'placed in'} ${result.place ? placeLabel(result.place) : (room.value?.name ?? 'the room')}.`,
    );
    open.value = false;
    emit('placed');
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (fe.roomId || fe.bed) return void (fields.value = fe);
    const code = getApiErrorCode(e);
    serverError.value = getApiErrorMessage(
      e,
      code === 'ROOM_FULL'
        ? 'That room is full. Choose another room.'
        : code === 'BED_TAKEN'
          ? 'That bed is taken. Choose another bed.'
          : 'The boarder wasn’t placed. Try again.',
    );
  }
}

const selectClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[480px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{
          student?.place ? `Move ${student.name}` : `Place ${student?.name ?? 'boarder'}`
        }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          {{
            student?.place
              ? `Now in ${placeLabel(student.place)}. Their old bed is freed.`
              : `A room in one of ${student?.campus ?? 'their campus'}’s hostels.`
          }}
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not placed"
          :description="serverError"
          role="alert"
        />
        <Skeleton v-if="hostelsPending" class="h-9" />
        <InlineNotice
          v-else-if="!hostels.length"
          tone="warning"
          title="No hostels at this campus"
          :description="`Add a hostel for ${student?.campus ?? 'the campus'} in Boarding › Hostels first.`"
        />
        <template v-else>
          <FieldShell id="place-hostel" label="Hostel" required :error="err('hostelId')">
            <select
              id="place-hostel"
              :value="hostelSel"
              :class="selectClass"
              :aria-invalid="!!err('hostelId')"
              @change="pickHostel(($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>Choose…</option>
              <option v-for="h in hostels" :key="h.id" :value="h.id">
                {{ h.name }} · {{ h.gender }} · {{ pluralize(h.totals.free, 'free place') }}
              </option>
            </select>
          </FieldShell>
          <InlineNotice
            v-if="genderWarning"
            tone="warning"
            :title="genderWarning"
            description="You’ll be asked to confirm before they’re placed here."
          />

          <template v-if="hostelSel">
            <Skeleton v-if="occupancyLoading && !rooms.length" class="h-9" />
            <p v-else-if="!rooms.length" class="text-[13px] text-muted-foreground">
              This hostel has no rooms yet.
            </p>
            <FieldShell v-else id="place-room" label="Room" required :error="err('roomId')">
              <select
                id="place-room"
                :value="roomId"
                :class="selectClass"
                :aria-invalid="!!err('roomId')"
                @change="pickRoom(($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>Choose…</option>
                <option v-for="r in rooms" :key="r.id" :value="r.id" :disabled="!roomFree(r)">
                  {{ floorName(r.floorId) ? `${floorName(r.floorId)} · ` : '' }}{{ r.name }} ·
                  {{
                    isCurrentRoom(r.id)
                      ? 'their room now'
                      : roomFree(r)
                        ? `${pluralize(roomFree(r), 'free place')} of ${r.capacity}`
                        : 'full'
                  }}
                </option>
              </select>
            </FieldShell>
          </template>

          <FieldShell
            v-if="room?.beds.length"
            id="place-bed"
            label="Bed"
            required
            :error="err('bed')"
          >
            <select id="place-bed" v-model="bed" :class="selectClass" :aria-invalid="!!err('bed')">
              <option value="" disabled>Choose…</option>
              <option v-for="b in room.beds" :key="b" :value="b" :disabled="bedTaken(b)">
                Bed {{ b }}{{ bedTaken(b) ? ' · taken' : '' }}
              </option>
            </select>
          </FieldShell>
        </template>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="pending || !hostels.length"
            ><Spinner v-if="pending" />{{ student?.place ? 'Move' : 'Place' }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
