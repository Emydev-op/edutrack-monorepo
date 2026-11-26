<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useSaveRoomMutation } from '@/api/services/boarding';
import type { BedStyle, Hostel, HostelRoom } from '@/types';

import { bedLabels, bedSummary, MAX_ROOM_CAPACITY } from './boarding-format';

/** Adds one room or edits one: name, floor, places and bed labels (generated or typed). */
const props = defineProps<{
  hostel: Hostel;
  room: HostelRoom | null;
  /** The floor to start with when adding. */
  floorId?: string | null;
}>();
const open = defineModel<boolean>('open', { required: true });

const save = useSaveRoomMutation();

type BedMode = BedStyle | 'custom';
const BED_MODES: { value: BedMode; label: string }[] = [
  { value: 'none', label: 'No labels' },
  { value: 'numbers', label: 'Numbers' },
  { value: 'letters', label: 'Letters' },
  { value: 'custom', label: 'Type them' },
];

const modeOf = (beds: string[]): BedMode => {
  if (!beds.length) return 'none';
  const same = (style: BedStyle) => bedLabels(style, beds.length).join('|') === beds.join('|');
  return same('numbers') ? 'numbers' : same('letters') ? 'letters' : 'custom';
};

const form = reactive({
  name: '',
  floorId: '',
  capacity: '4',
  bedMode: 'none' as BedMode,
  custom: '',
});
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(open, (o) => {
  if (!o) return;
  const r = props.room;
  Object.assign(form, {
    name: r?.name ?? '',
    floorId: r ? (r.floorId ?? '') : (props.floorId ?? props.hostel.floors[0]?.id ?? ''),
    capacity: String(r?.capacity ?? 4),
    bedMode: modeOf(r?.beds ?? []),
    custom: (r?.beds ?? []).join(', '),
  });
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch(form, () => (fields.value = {}), { deep: true });

const capacity = computed(() => (/^\d+$/.test(form.capacity.trim()) ? Number(form.capacity) : NaN));
const beds = computed(() => {
  if (form.bedMode === 'custom')
    return form.custom
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
  return Number.isNaN(capacity.value) ? [] : bedLabels(form.bedMode, capacity.value);
});

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.name.trim()) e.name ??= 'Name the room, e.g. Room 4.';
  else if (
    props.hostel.rooms.some(
      (r) => r.id !== props.room?.id && r.name.toLowerCase() === form.name.trim().toLowerCase(),
    )
  )
    e.name ??= `${props.hostel.name} already has ${form.name.trim()}.`;
  const cap = capacity.value;
  if (!(cap >= 1 && cap <= MAX_ROOM_CAPACITY))
    e.capacity ??= `A whole number from 1 to ${MAX_ROOM_CAPACITY}.`;
  if (form.bedMode === 'custom' && !e.capacity) {
    if (beds.value.length !== cap)
      e.beds ??= `Give ${cap} bed labels, one per place (you have ${beds.value.length}).`;
    else if (new Set(beds.value.map((b) => b.toLowerCase())).size !== beds.value.length)
      e.beds ??= 'Each bed label must be different.';
  }
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  try {
    const result = await save.mutateAsync({
      hostelId: props.hostel.id,
      roomId: props.room?.id,
      name: form.name.trim(),
      capacity: capacity.value,
      floorId: form.floorId || null,
      beds: beds.value,
    });
    toast.success(
      messageOf(result, props.room ? `${form.name.trim()} saved.` : `${form.name.trim()} added.`),
    );
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) return void (fields.value = fe);
    serverError.value = getApiErrorMessage(e, 'The room didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[480px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{
          room ? `Edit ${room.name}` : `Add a room to ${hostel.name}`
        }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Places are the beds in the room. A dormitory is one room with many places.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not saved"
          :description="serverError"
          role="alert"
        />
        <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FieldShell id="room-name" label="Name" required :error="err('name')">
            <Input
              id="room-name"
              v-model="form.name"
              maxlength="40"
              placeholder="e.g. Room 4"
              :aria-invalid="!!err('name')"
            />
          </FieldShell>
          <FieldShell id="room-capacity" label="Places" required :error="err('capacity')">
            <Input
              id="room-capacity"
              v-model="form.capacity"
              inputmode="numeric"
              :aria-invalid="!!err('capacity')"
            />
          </FieldShell>
        </div>

        <FieldShell
          v-if="hostel.floors.length"
          id="room-floor"
          label="Floor or wing"
          :error="err('floorId')"
        >
          <select
            id="room-floor"
            v-model="form.floorId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="f in hostel.floors" :key="f.id" :value="f.id">{{ f.name }}</option>
            <option value="">No floor</option>
          </select>
        </FieldShell>

        <FieldShell
          id="room-beds"
          label="Bed labels"
          :error="err('beds')"
          :hint="
            form.bedMode === 'custom'
              ? 'Separate with commas, one per place, e.g. Top 1, Bottom 1, Top 2, Bottom 2.'
              : beds.length
                ? bedSummary(beds)
                : 'Beds aren’t labelled.'
          "
        >
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Bed labels">
            <button
              v-for="m in BED_MODES"
              :key="m.value"
              type="button"
              role="radio"
              :aria-checked="form.bedMode === m.value"
              class="rounded-md border px-3 py-1.5 text-sm"
              :class="
                form.bedMode === m.value
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:border-primary'
              "
              @click="form.bedMode = m.value"
            >
              {{ m.label }}
            </button>
          </div>
          <Input
            v-if="form.bedMode === 'custom'"
            id="room-beds"
            v-model="form.custom"
            placeholder="A, B, C, D"
            :aria-invalid="!!err('beds')"
          />
        </FieldShell>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="save.isPending.value"
            ><Spinner v-if="save.isPending.value" />{{ room ? 'Save room' : 'Add room' }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
