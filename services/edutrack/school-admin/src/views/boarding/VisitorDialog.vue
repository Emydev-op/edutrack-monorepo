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

import { useLogVisitorMutation } from '@/api/services/boarding-house';
import type { VisitorPayload } from '@/types';

import BoarderSearch from './BoarderSearch.vue';
import type { PickedStudent } from './house-format';

/** Logs a visitor coming in at the gate: who, their phone, why, and the boarder they’re seeing. */
const props = defineProps<{ branchId: string; campus: string }>();
const open = defineModel<boolean>('open', { required: true });

const logVisitor = useLogVisitorMutation();
const form = reactive({ name: '', phone: '', purpose: '' });
const visiting = ref<PickedStudent | null>(null);
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(open, (o) => {
  if (!o) return;
  Object.assign(form, { name: '', phone: '', purpose: '' });
  visiting.value = null;
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch([form, visiting], () => (fields.value = {}));

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.name.trim()) e.name ??= 'Enter the visitor’s name.';
  if (!form.purpose.trim()) e.purpose ??= 'Why are they here?';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload: VisitorPayload = {
    branchId: props.branchId,
    name: form.name.trim(),
    purpose: form.purpose.trim(),
  };
  if (form.phone.trim()) payload.phone = form.phone.trim();
  if (visiting.value) payload.studentId = visiting.value.id;
  try {
    const r = await logVisitor.mutateAsync(payload);
    toast.success(messageOf(r, `${payload.name} logged in at the gate.`));
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) fields.value = fe;
    else serverError.value = getApiErrorMessage(e, 'The visitor wasn’t logged. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[460px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Log a visitor</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          {{ campus }} gate. They show under Visitors on site until you log them out.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Visitor not logged"
          :description="serverError"
          role="alert"
        />
        <FieldShell id="visitor-name" label="Name" required :error="err('name')">
          <Input
            id="visitor-name"
            v-model="form.name"
            maxlength="100"
            placeholder="e.g. Mrs Ngozi Eze"
            :aria-invalid="!!err('name')"
          />
        </FieldShell>
        <FieldShell id="visitor-phone" label="Phone" :error="err('phone')" hint="Optional.">
          <Input
            id="visitor-phone"
            v-model="form.phone"
            type="tel"
            inputmode="tel"
            maxlength="20"
            placeholder="e.g. 0803 123 4567"
            :aria-invalid="!!err('phone')"
          />
        </FieldShell>
        <FieldShell id="visitor-purpose" label="Purpose" required :error="err('purpose')">
          <Input
            id="visitor-purpose"
            v-model="form.purpose"
            maxlength="150"
            placeholder="e.g. Bringing provisions"
            :aria-invalid="!!err('purpose')"
          />
        </FieldShell>
        <FieldShell
          id="visitor-student"
          label="Visiting"
          :error="err('studentId')"
          hint="Optional. The boarder they came to see."
        >
          <BoarderSearch id="visitor-student" v-model="visiting" />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="logVisitor.isPending.value"
            ><Spinner v-if="logVisitor.isPending.value" />Log visitor</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
