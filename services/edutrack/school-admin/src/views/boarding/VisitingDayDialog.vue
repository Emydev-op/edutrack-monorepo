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
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useBoardingSettingsQuery } from '@/api/services/boarding';
import { useAddVisitingDayMutation } from '@/api/services/boarding-house';
import type { VisitingDayPayload } from '@/types';

import { boardingCampuses, dayLabel, lagosToday, SELECT_CLASS } from './house-format';

/** Adds a visiting day for a campus. Boarders’ parents are told. */
const open = defineModel<boolean>('open', { required: true });

const { data: settings } = useBoardingSettingsQuery();
const add = useAddVisitingDayMutation();
const campuses = computed(() => boardingCampuses(settings.value));

const initial = () => ({
  branchId: campuses.value[0]?.branchId ?? '',
  date: '',
  startsAt: '10:00',
  endsAt: '15:00',
  note: '',
});
const form = reactive(initial());
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch(form, () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.date) e.date ??= 'Choose the day.';
  else if (form.date < lagosToday()) e.date ??= 'Choose today or a later day.';
  if (!form.startsAt) e.startsAt ??= 'When do visits start?';
  if (!form.endsAt) e.endsAt ??= 'When do visits end?';
  else if (form.startsAt && form.endsAt <= form.startsAt) e.endsAt ??= 'End after the start.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: VisitingDayPayload = {
    date: form.date,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
  };
  if (form.branchId) payload.branchId = form.branchId;
  if (form.note.trim()) payload.note = form.note.trim();
  try {
    await add.mutateAsync(payload);
    toast.success(`Visiting day added for ${dayLabel(form.date)}. Parents have been told.`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'The visiting day wasn’t added. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[440px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Add visiting day</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Parents of boarders at the campus are told, and see it in the Parent Portal.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Visiting day not added"
          :description="serverError"
          role="alert"
        />
        <FieldShell
          v-if="campuses.length > 1"
          id="vd-campus"
          label="Campus"
          required
          :error="err('branchId')"
        >
          <select id="vd-campus" v-model="form.branchId" :class="SELECT_CLASS">
            <option v-for="c in campuses" :key="c.branchId" :value="c.branchId">
              {{ c.name }}
            </option>
          </select>
        </FieldShell>
        <FieldShell id="vd-date" label="Day" required :error="err('date')">
          <Input
            id="vd-date"
            v-model="form.date"
            type="date"
            :min="lagosToday()"
            :aria-invalid="!!err('date')"
          />
        </FieldShell>
        <div class="grid grid-cols-2 gap-4">
          <FieldShell id="vd-start" label="From" required :error="err('startsAt')">
            <Input
              id="vd-start"
              v-model="form.startsAt"
              type="time"
              :aria-invalid="!!err('startsAt')"
            />
          </FieldShell>
          <FieldShell id="vd-end" label="To" required :error="err('endsAt')">
            <Input id="vd-end" v-model="form.endsAt" type="time" :aria-invalid="!!err('endsAt')" />
          </FieldShell>
        </div>
        <FieldShell id="vd-note" label="Note for parents" :error="err('note')" hint="Optional.">
          <Input
            id="vd-note"
            v-model="form.note"
            maxlength="200"
            placeholder="e.g. Visitors stay in the dining hall"
          />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="add.isPending.value"
            ><Spinner v-if="add.isPending.value" />Add visiting day</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
