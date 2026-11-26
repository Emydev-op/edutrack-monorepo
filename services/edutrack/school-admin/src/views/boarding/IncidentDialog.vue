<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
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

import { useRecordIncidentMutation } from '@/api/services/boarding-house';
import type { IncidentPayload } from '@/types';

import BoarderSearch from './BoarderSearch.vue';
import { lagosLocal, SELECT_CLASS, type PickedStudent } from './house-format';

/** Records a hostel incident for a boarder: what happened, what was done, and whether parents see it. */
const props = defineProps<{
  categories: string[];
  /** The boarder, when opened from their record. */
  student?: PickedStudent | null;
}>();
const open = defineModel<boolean>('open', { required: true });

const recordIncident = useRecordIncidentMutation();
const initial = () => ({
  category: '',
  description: '',
  action: '',
  occurredAt: lagosLocal(),
  shareWithParent: false,
});
const picked = ref<PickedStudent | null>(null);
const form = reactive(initial());
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);
watch(open, (o) => {
  if (!o) return;
  picked.value = props.student ?? null;
  Object.assign(form, initial());
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch([form, picked], () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!picked.value) e.studentId ??= 'Choose the boarder.';
  if (!form.category) e.category ??= 'Choose a category.';
  if (!form.description.trim()) e.description ??= 'Say what happened.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: IncidentPayload = {
    studentId: picked.value!.id,
    category: form.category,
    description: form.description.trim(),
    shareWithParent: form.shareWithParent,
  };
  if (form.action.trim()) payload.action = form.action.trim();
  if (form.occurredAt) payload.occurredAt = form.occurredAt;
  try {
    await recordIncident.mutateAsync(payload);
    toast.success(
      form.shareWithParent
        ? `Incident recorded for ${picked.value!.name}. Their parents can see it.`
        : `Incident recorded for ${picked.value!.name}.`,
    );
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'The incident wasn’t recorded. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[500px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Record incident</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Kept on the boarder’s record. Parents see it only if you share it.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Incident not recorded"
          :description="serverError"
          role="alert"
        />
        <FieldShell id="inc-student" label="Boarder" required :error="err('studentId')">
          <div
            v-if="student"
            class="flex flex-col rounded-md border bg-surface-warm px-3 py-2 text-[13px]"
          >
            <span class="font-medium">{{ student.name }}</span>
            <span class="text-xs text-muted-foreground">{{ student.detail }}</span>
          </div>
          <BoarderSearch v-else id="inc-student" v-model="picked" :invalid="!!err('studentId')" />
        </FieldShell>
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell id="inc-category" label="Category" required :error="err('category')">
            <select
              id="inc-category"
              v-model="form.category"
              :class="SELECT_CLASS"
              :aria-invalid="!!err('category')"
            >
              <option value="" disabled>Choose…</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </FieldShell>
          <FieldShell id="inc-when" label="When" :error="err('occurredAt')">
            <Input id="inc-when" v-model="form.occurredAt" type="datetime-local" />
          </FieldShell>
        </div>
        <FieldShell id="inc-desc" label="What happened" required :error="err('description')">
          <Textarea
            id="inc-desc"
            v-model="form.description"
            rows="3"
            maxlength="1000"
            placeholder="e.g. Found with a phone after lights out"
            :aria-invalid="!!err('description')"
          />
        </FieldShell>
        <FieldShell id="inc-action" label="Action taken" :error="err('action')" hint="Optional.">
          <Textarea
            id="inc-action"
            v-model="form.action"
            rows="2"
            maxlength="500"
            placeholder="e.g. Phone kept by the house master until end of term"
          />
        </FieldShell>
        <label class="flex items-start gap-2.5 text-[13px]">
          <Checkbox
            :model-value="form.shareWithParent"
            class="mt-0.5"
            @update:model-value="form.shareWithParent = $event === true"
          />
          <span class="flex flex-col">
            <span class="font-medium">Share with parents</span>
            <span class="text-xs text-muted-foreground"
              >They see what happened and the action taken in the Parent Portal.</span
            >
          </span>
        </label>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="recordIncident.isPending.value"
            ><Spinner v-if="recordIncident.isPending.value" />Record incident</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
