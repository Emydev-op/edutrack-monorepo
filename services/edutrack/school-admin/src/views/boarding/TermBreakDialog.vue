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
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery, useHostelsQuery } from '@/api/services/boarding';
import { useTermBreakMutation } from '@/api/services/boarding-house';
import type { TermBreakPayload } from '@/types';

import { boardingCampuses, lagosAt, SELECT_CLASS } from './house-format';

/**
 * Gives every boarder at a campus (or in one hostel) a Term break exeat in one go. Boarders who
 * already have leave over those dates are skipped.
 */
const open = defineModel<boolean>('open', { required: true });

const { data: settings } = useBoardingSettingsQuery();
const { data: hostelList } = useHostelsQuery();
const termBreak = useTermBreakMutation();

const campuses = computed(() => boardingCampuses(settings.value));
const initial = () => ({
  branchId: campuses.value[0]?.branchId ?? '',
  hostelId: '',
  leaveAt: lagosAt(0, '12:00'),
  returnBy: lagosAt(7, '16:00'),
  reason: 'Term break',
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
watch(
  () => form.branchId,
  () => (form.hostelId = ''),
);

const hostels = computed(() =>
  (hostelList.value?.hostels ?? []).filter((h) => h.branchId === form.branchId),
);

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.branchId) e.branchId ??= 'Choose the campus.';
  if (!form.leaveAt) e.leaveAt ??= 'When do boarders leave?';
  if (!form.returnBy) e.returnBy ??= 'When should they be back?';
  else if (form.leaveAt && form.returnBy <= form.leaveAt)
    e.returnBy ??= 'They must be back after they leave.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: TermBreakPayload = {
    branchId: form.branchId,
    leaveAt: form.leaveAt,
    returnBy: form.returnBy,
  };
  if (form.hostelId) payload.hostelId = form.hostelId;
  if (form.reason.trim()) payload.reason = form.reason.trim();
  try {
    const r = await termBreak.mutateAsync(payload);
    const skipped = r.skipped
      ? ` ${pluralize(r.skipped, 'boarder')} skipped — they already have leave then.`
      : '';
    toast.success(`${pluralize(r.created, 'term break exeat')} created.${skipped}`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'Nothing was created. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[480px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Term break</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Gives every boarder an exeat for the break. At the gate, any parent or approved pickup
          person can sign them out.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Term break exeats not created"
          :description="serverError"
          role="alert"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="tb-campus" label="Campus" required :error="err('branchId')">
            <select
              id="tb-campus"
              v-model="form.branchId"
              :class="SELECT_CLASS"
              :aria-invalid="!!err('branchId')"
            >
              <option v-for="c in campuses" :key="c.branchId" :value="c.branchId">
                {{ c.name }}
              </option>
            </select>
          </FieldShell>
          <FieldShell id="tb-hostel" label="Hostel" :error="err('hostelId')">
            <select id="tb-hostel" v-model="form.hostelId" :class="SELECT_CLASS">
              <option value="">Every hostel</option>
              <option v-for="h in hostels" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
          </FieldShell>
          <FieldShell id="tb-leave" label="Leaves" required :error="err('leaveAt')">
            <Input
              id="tb-leave"
              v-model="form.leaveAt"
              type="datetime-local"
              :aria-invalid="!!err('leaveAt')"
            />
          </FieldShell>
          <FieldShell id="tb-return" label="Back by" required :error="err('returnBy')">
            <Input
              id="tb-return"
              v-model="form.returnBy"
              type="datetime-local"
              :min="form.leaveAt"
              :aria-invalid="!!err('returnBy')"
            />
          </FieldShell>
        </div>
        <FieldShell id="tb-reason" label="Reason" :error="err('reason')" hint="Optional.">
          <Textarea
            id="tb-reason"
            v-model="form.reason"
            rows="2"
            maxlength="300"
            placeholder="e.g. Mid-term break"
          />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="termBreak.isPending.value"
            ><Spinner v-if="termBreak.isPending.value" />Create exeats</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
