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
import { formatCount, pluralize } from '@edutrack/app-kit/lib/format';

import { useGenerateRoomsMutation } from '@/api/services/boarding';
import type { BedStyle, Hostel } from '@/types';

import { bedLabels, bedSummary, MAX_ROOM_CAPACITY, MAX_ROOMS_AT_ONCE } from './boarding-format';

/**
 * Adds many rooms at once: how many, the name prefix and start number, places in each and how
 * beds are labelled, with a live preview ("Room 1 … Room 10 · 4 places each · beds A–D").
 */
const props = defineProps<{ hostel: Hostel; floorId?: string | null }>();
const open = defineModel<boolean>('open', { required: true });

const generate = useGenerateRoomsMutation();

const BED_STYLES: { value: BedStyle; label: string }[] = [
  { value: 'none', label: 'No labels' },
  { value: 'numbers', label: 'Numbers (1, 2, 3…)' },
  { value: 'letters', label: 'Letters (A, B, C…)' },
];

/** The next free number after rooms already called "<prefix> <n>". */
function nextNumber(prefix: string) {
  const p = prefix.trim().toLowerCase();
  let max = 0;
  for (const r of props.hostel.rooms) {
    const m = /^(.*?)\s*(\d+)$/.exec(r.name.trim());
    if (m && m[1]!.trim().toLowerCase() === p) max = Math.max(max, Number(m[2]));
  }
  return max + 1;
}

const form = reactive({
  floorId: '',
  count: '10',
  prefix: 'Room',
  startAt: '1',
  capacity: '4',
  bedStyle: 'none' as BedStyle,
});
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);
/** Start number follows the prefix until the user types their own. */
const startTouched = ref(false);

watch(open, (o) => {
  if (!o) return;
  Object.assign(form, {
    floorId: props.floorId ?? props.hostel.floors[0]?.id ?? '',
    count: '10',
    prefix: 'Room',
    startAt: String(nextNumber('Room')),
    capacity: '4',
    bedStyle: 'none',
  });
  startTouched.value = false;
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch(
  () => form.prefix,
  (p) => !startTouched.value && (form.startAt = String(nextNumber(p))),
);
watch(form, () => (fields.value = {}), { deep: true });

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  const count = int(form.count);
  if (!(count >= 1 && count <= MAX_ROOMS_AT_ONCE))
    e.count ??= `Add 1 to ${MAX_ROOMS_AT_ONCE} rooms at a time.`;
  const cap = int(form.capacity);
  if (!(cap >= 1 && cap <= MAX_ROOM_CAPACITY))
    e.capacity ??= `A whole number from 1 to ${MAX_ROOM_CAPACITY}.`;
  if (Number.isNaN(int(form.startAt))) e.startAt ??= 'Start from a whole number.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

const preview = computed(() => {
  const count = int(form.count);
  const start = int(form.startAt);
  const cap = int(form.capacity);
  if (errors.value.count || errors.value.startAt || errors.value.capacity) return '';
  const name = (n: number) => `${form.prefix.trim() ? `${form.prefix.trim()} ` : ''}${n}`;
  const names =
    count === 1
      ? name(start)
      : count === 2
        ? `${name(start)}, ${name(start + 1)}`
        : `${name(start)} … ${name(start + count - 1)}`;
  const beds = bedSummary(bedLabels(form.bedStyle, cap));
  return [names, `${pluralize(cap, 'place')}${count > 1 ? ' each' : ''}`, beds]
    .filter(Boolean)
    .join(' · ');
});
const totalPlaces = computed(() => (preview.value ? int(form.count) * int(form.capacity) : 0));

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  try {
    const result = await generate.mutateAsync({
      hostelId: props.hostel.id,
      floorId: form.floorId || null,
      count: int(form.count),
      prefix: form.prefix.trim(),
      startAt: int(form.startAt),
      capacity: int(form.capacity),
      bedStyle: form.bedStyle,
    });
    toast.success(messageOf(result, `${pluralize(int(form.count), 'room')} added.`));
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) return void (fields.value = fe);
    serverError.value = getApiErrorMessage(e, 'The rooms weren’t added. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[540px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Add rooms to {{ hostel.name }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Add many rooms at once. You can rename or change any room afterwards.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Rooms not added"
          :description="serverError"
          role="alert"
        />

        <FieldShell
          v-if="hostel.floors.length"
          id="gen-floor"
          label="Floor or wing"
          :error="err('floorId')"
        >
          <select
            id="gen-floor"
            v-model="form.floorId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="f in hostel.floors" :key="f.id" :value="f.id">{{ f.name }}</option>
            <option value="">No floor</option>
          </select>
        </FieldShell>

        <div class="grid gap-4 sm:grid-cols-3">
          <FieldShell id="gen-count" label="How many" required :error="err('count')">
            <Input
              id="gen-count"
              v-model="form.count"
              inputmode="numeric"
              :aria-invalid="!!err('count')"
            />
          </FieldShell>
          <FieldShell id="gen-prefix" label="Name prefix" hint="e.g. Room or Dorm">
            <Input id="gen-prefix" v-model="form.prefix" maxlength="30" />
          </FieldShell>
          <FieldShell id="gen-start" label="Start at" :error="err('startAt')">
            <Input
              id="gen-start"
              v-model="form.startAt"
              inputmode="numeric"
              :aria-invalid="!!err('startAt')"
              @input="startTouched = true"
            />
          </FieldShell>
        </div>

        <FieldShell
          id="gen-capacity"
          label="Places in each room"
          required
          :error="err('capacity')"
          hint="Beds per room. One big dormitory? Add 1 room with all its places."
        >
          <Input
            id="gen-capacity"
            v-model="form.capacity"
            inputmode="numeric"
            class="sm:max-w-40"
            :aria-invalid="!!err('capacity')"
          />
        </FieldShell>

        <FieldShell id="gen-beds" label="Bed labels">
          <div id="gen-beds" class="flex flex-wrap gap-2" role="radiogroup" aria-label="Bed labels">
            <button
              v-for="s in BED_STYLES"
              :key="s.value"
              type="button"
              role="radio"
              :aria-checked="form.bedStyle === s.value"
              class="rounded-md border px-3 py-1.5 text-sm"
              :class="
                form.bedStyle === s.value
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:border-primary'
              "
              @click="form.bedStyle = s.value"
            >
              {{ s.label }}
            </button>
          </div>
        </FieldShell>

        <div
          class="flex flex-col gap-0.5 rounded-md border border-dashed bg-muted px-3.5 py-2.5 text-[13px]"
          aria-live="polite"
        >
          <span class="text-xs text-muted-foreground">Preview</span>
          <span class="font-medium">{{ preview || '—' }}</span>
          <span v-if="totalPlaces" class="text-xs text-muted-foreground"
            >{{ formatCount(totalPlaces) }} places in all</span
          >
        </div>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="generate.isPending.value"
            ><Spinner v-if="generate.isPending.value" />Add
            {{ errors.count ? 'rooms' : pluralize(int(form.count), 'room') }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
