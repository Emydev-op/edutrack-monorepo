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

import { useRecordSickVisitMutation } from '@/api/services/boarding-house';
import type { SickBayOutcome, SickVisitPayload } from '@/types';

import { lagosLocal, SELECT_CLASS, SICK_BAY_OUTCOMES, type PickedStudent } from './house-format';
import StudentMedicalNotes from './StudentMedicalNotes.vue';
import StudentSearch from './StudentSearch.vue';

/** Records a sick bay visit: the complaint, what the nurse found and gave, and what happened. */
const open = defineModel<boolean>('open', { required: true });

const record = useRecordSickVisitMutation();
const initial = () => ({
  complaint: '',
  assessment: '',
  treatment: '',
  medication: '',
  outcome: 'Back to class' as SickBayOutcome,
  notes: '',
  seenAt: lagosLocal(),
});
const picked = ref<PickedStudent | null>(null);
const form = reactive(initial());
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(open, (o) => {
  if (!o) return;
  picked.value = null;
  Object.assign(form, initial());
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch([form, picked], () => {
  fields.value = {};
  serverError.value = '';
});

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!picked.value) e.studentId ??= 'Choose the student.';
  if (!form.complaint.trim()) e.complaint ??= 'What did they come in with?';
  if (form.seenAt && form.seenAt > lagosLocal())
    e.seenAt ??= 'The time seen can’t be later than now.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const optional = (v: string) => v.trim() || undefined;
  const payload: SickVisitPayload = {
    studentId: picked.value!.id,
    complaint: form.complaint.trim(),
    assessment: optional(form.assessment),
    treatment: optional(form.treatment),
    medication: optional(form.medication),
    outcome: form.outcome,
    notes: optional(form.notes),
    seenAt: form.seenAt || undefined,
  };
  try {
    const r = await record.mutateAsync(payload);
    toast.success(
      messageOf(
        r,
        form.outcome === 'Admitted'
          ? `${picked.value!.name} admitted to the sick bay. Their parents have been told.`
          : `Visit recorded for ${picked.value!.name}. Their parents have been told.`,
      ),
    );
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'The visit wasn’t saved. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[540px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Record sick bay visit</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Parents are told about the visit and its outcome.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Visit not recorded"
          :description="serverError"
          role="alert"
        />
        <FieldShell id="sick-student" label="Student" required :error="err('studentId')">
          <StudentSearch id="sick-student" v-model="picked" :invalid="!!err('studentId')" />
        </FieldShell>
        <StudentMedicalNotes v-if="picked" :student-id="picked.id" />

        <FieldShell id="sick-complaint" label="Complaint" required :error="err('complaint')">
          <Input
            id="sick-complaint"
            v-model="form.complaint"
            maxlength="200"
            placeholder="e.g. Headache and fever since morning"
            :aria-invalid="!!err('complaint')"
          />
        </FieldShell>
        <FieldShell id="sick-assessment" label="Assessment" :error="err('assessment')">
          <Input
            id="sick-assessment"
            v-model="form.assessment"
            maxlength="300"
            placeholder="e.g. Temperature 38.4°C, suspected malaria"
          />
        </FieldShell>
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="sick-treatment" label="Treatment" :error="err('treatment')">
            <Input
              id="sick-treatment"
              v-model="form.treatment"
              maxlength="300"
              placeholder="e.g. Tepid sponging, rest"
            />
          </FieldShell>
          <FieldShell id="sick-medication" label="Medication given" :error="err('medication')">
            <Input
              id="sick-medication"
              v-model="form.medication"
              maxlength="300"
              placeholder="e.g. Paracetamol 500mg"
            />
          </FieldShell>
          <FieldShell id="sick-outcome" label="Outcome" required :error="err('outcome')">
            <select id="sick-outcome" v-model="form.outcome" :class="SELECT_CLASS">
              <option v-for="o in SICK_BAY_OUTCOMES" :key="o" :value="o">{{ o }}</option>
            </select>
          </FieldShell>
          <FieldShell id="sick-seen" label="Time seen" :error="err('seenAt')">
            <Input
              id="sick-seen"
              v-model="form.seenAt"
              type="datetime-local"
              :aria-invalid="!!err('seenAt')"
            />
          </FieldShell>
        </div>
        <FieldShell id="sick-notes" label="Notes" :error="err('notes')" hint="Optional.">
          <Textarea
            id="sick-notes"
            v-model="form.notes"
            rows="2"
            maxlength="500"
            placeholder="e.g. Check again after prep"
          />
        </FieldShell>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="record.isPending.value"
            ><Spinner v-if="record.isPending.value" />Record visit</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
