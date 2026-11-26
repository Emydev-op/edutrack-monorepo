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

import { useAddPickupMutation } from '@/api/services/boarding-house';
import type { PickupPayload } from '@/types';

/** Adds someone allowed to collect a boarder on exeat, besides their parents. */
const props = defineProps<{ studentId: string; studentName: string }>();
const open = defineModel<boolean>('open', { required: true });

const add = useAddPickupMutation();
const form = reactive({ name: '', relationship: '', phone: '', note: '' });
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, { name: '', relationship: '', phone: '', note: '' });
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch(form, () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.name.trim()) e.name ??= 'Enter their full name.';
  if (!form.relationship.trim()) e.relationship ??= 'How are they related to the boarder?';
  if (!form.phone.trim()) e.phone ??= 'The gate calls this number to check.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: PickupPayload = {
    name: form.name.trim(),
    relationship: form.relationship.trim(),
    phone: form.phone.trim(),
  };
  if (form.note.trim()) payload.note = form.note.trim();
  try {
    await add.mutateAsync({ studentId: props.studentId, ...payload });
    toast.success(`${payload.name} can now collect ${props.studentName}.`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[440px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Add pickup person</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Someone besides the parents who may collect {{ studentName }} on exeat. Up to 10.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not added"
          :description="serverError"
          role="alert"
        />
        <FieldShell id="pickup-name" label="Full name" required :error="err('name')">
          <Input
            id="pickup-name"
            v-model="form.name"
            maxlength="100"
            placeholder="e.g. Mr Tunde Bakare"
            :aria-invalid="!!err('name')"
          />
        </FieldShell>
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell
            id="pickup-relationship"
            label="Relationship"
            required
            :error="err('relationship')"
          >
            <Input
              id="pickup-relationship"
              v-model="form.relationship"
              maxlength="40"
              placeholder="e.g. Uncle or Driver"
              :aria-invalid="!!err('relationship')"
            />
          </FieldShell>
          <FieldShell id="pickup-phone" label="Phone" required :error="err('phone')">
            <Input
              id="pickup-phone"
              v-model="form.phone"
              type="tel"
              inputmode="tel"
              maxlength="20"
              placeholder="e.g. 0803 123 4567"
              :aria-invalid="!!err('phone')"
            />
          </FieldShell>
        </div>
        <FieldShell
          id="pickup-note"
          label="Note for the gate"
          :error="err('note')"
          hint="Optional."
        >
          <Input
            id="pickup-note"
            v-model="form.note"
            maxlength="200"
            placeholder="e.g. Drives a white Corolla, brings ID card"
          />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="add.isPending.value"
            ><Spinner v-if="add.isPending.value" />Add</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
