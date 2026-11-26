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
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useGiveExeatMutation, usePickupsQuery } from '@/api/services/boarding-house';
import type { ExeatKind, ExeatPayload } from '@/types';

import BoarderSearch from './BoarderSearch.vue';
import {
  lagosAt,
  REASON_KINDS,
  SELECT_CLASS,
  SINGLE_EXEAT_KINDS,
  type PickedStudent,
} from './house-format';

/**
 * The office gives a boarder an exeat (approved straight away): what kind, when they leave and
 * return, why, and who collects them — one of their pickup people or a parent.
 */
const props = defineProps<{
  /** The boarder, when opened from their record; otherwise the dialog searches for one. */
  student?: PickedStudent | null;
}>();
const open = defineModel<boolean>('open', { required: true });

const give = useGiveExeatMutation();

const initial = () => ({
  kind: 'Weekend' as ExeatKind,
  reason: '',
  leaveAt: lagosAt(0, '16:00'),
  returnBy: lagosAt(2, '17:00'),
  pickupPersonId: '',
});
const picked = ref<PickedStudent | null>(null);
const form = reactive(initial());
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(
  open,
  (o) => {
    if (!o) return;
    picked.value = props.student ?? null;
    Object.assign(form, initial());
    fields.value = {};
    serverError.value = '';
    showErrors.value = false;
  },
  { immediate: true },
);
watch([picked, form], () => {
  fields.value = {};
  serverError.value = '';
});
watch(picked, () => (form.pickupPersonId = ''));

const studentId = computed(() => picked.value?.id ?? '');
const { data: pickups, isPending: pickupsPending } = usePickupsQuery(studentId);

const needsReason = computed(() => REASON_KINDS.includes(form.kind));
const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!picked.value) e.studentId ??= 'Choose the boarder.';
  if (needsReason.value && !form.reason.trim())
    e.reason ??= `Say why — a reason is needed for ${form.kind.toLowerCase()} exeats.`;
  if (!form.leaveAt) e.leaveAt ??= 'When do they leave?';
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
  const payload: ExeatPayload = {
    studentId: picked.value!.id,
    kind: form.kind,
    leaveAt: form.leaveAt,
    returnBy: form.returnBy,
    pickupPersonId: form.pickupPersonId || null,
  };
  if (form.reason.trim()) payload.reason = form.reason.trim();
  try {
    const result = await give.mutateAsync(payload);
    toast.success(
      messageOf(result, `Exeat given to ${picked.value!.name}. Their parents have been told.`),
    );
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    serverError.value = Object.keys(fe).length
      ? ''
      : getApiErrorMessage(e, 'The exeat wasn’t saved. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[520px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Give exeat</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Approved straight away. The boarder’s parents are told, and the gate sees them in Leaving.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Exeat not given"
          :description="serverError"
          role="alert"
        />

        <FieldShell id="exeat-student" label="Boarder" required :error="err('studentId')">
          <div
            v-if="student"
            class="flex flex-col rounded-md border bg-surface-warm px-3 py-2 text-[13px]"
          >
            <span class="font-medium">{{ student.name }}</span>
            <span class="text-xs text-muted-foreground">{{ student.detail }}</span>
          </div>
          <BoarderSearch v-else id="exeat-student" v-model="picked" :invalid="!!err('studentId')" />
        </FieldShell>

        <FieldShell id="exeat-kind" label="Kind of exeat" required :error="err('kind')">
          <select
            id="exeat-kind"
            v-model="form.kind"
            :class="SELECT_CLASS"
            :aria-invalid="!!err('kind')"
          >
            <option v-for="k in SINGLE_EXEAT_KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
        </FieldShell>

        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="exeat-leave" label="Leaves" required :error="err('leaveAt')">
            <Input
              id="exeat-leave"
              v-model="form.leaveAt"
              type="datetime-local"
              :aria-invalid="!!err('leaveAt')"
            />
          </FieldShell>
          <FieldShell id="exeat-return" label="Back by" required :error="err('returnBy')">
            <Input
              id="exeat-return"
              v-model="form.returnBy"
              type="datetime-local"
              :min="form.leaveAt"
              :aria-invalid="!!err('returnBy')"
            />
          </FieldShell>
        </div>

        <FieldShell
          id="exeat-reason"
          label="Reason"
          :required="needsReason"
          :error="err('reason')"
          :hint="needsReason ? undefined : 'Optional.'"
        >
          <Textarea
            id="exeat-reason"
            v-model="form.reason"
            rows="2"
            maxlength="300"
            placeholder="e.g. Sister’s wedding in Enugu"
            :aria-invalid="!!err('reason')"
          />
        </FieldShell>

        <FieldShell
          id="exeat-pickup"
          label="Who collects"
          :error="err('pickupPersonId')"
          :hint="
            picked && !pickupsPending && !pickups?.length
              ? 'No pickup people saved for this boarder, so a parent collects.'
              : 'The gate checks this person before signing the boarder out.'
          "
        >
          <select
            id="exeat-pickup"
            v-model="form.pickupPersonId"
            :class="SELECT_CLASS"
            :disabled="!picked"
            :aria-invalid="!!err('pickupPersonId')"
          >
            <option value="">A parent</option>
            <option v-for="p in pickups ?? []" :key="p.id" :value="p.id">
              {{ p.name }} ({{ p.relationship }}) · {{ p.phone }}
            </option>
          </select>
        </FieldShell>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="give.isPending.value"
            ><Spinner v-if="give.isPending.value" />Give exeat</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
