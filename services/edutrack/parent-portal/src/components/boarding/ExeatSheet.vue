<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { messageOf } from '@edutrack/web-core/http';

import { useRequestExeatMutation } from '@/api/services/boarding';
import AlertCard from '@/components/common/AlertCard.vue';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { EXEAT_KINDS, exeatSchema, REASON_REQUIRED } from '@/schema/boarding';
import type { PickupPerson } from '@/types';

/** "Ask for an exeat": the house master or mistress decides, and the parent is told. */
const props = defineProps<{
  childId: string;
  firstName: string;
  pickups: PickupPerson[];
}>();
const open = defineModel<boolean>('open', { default: false });

const request = useRequestExeatMutation(() => props.childId);
const problem = ref<string | null>(null);

const { handleSubmit, resetForm, setErrors, values } = useForm({
  validationSchema: exeatSchema,
});
watch(open, (isOpen) => {
  if (!isOpen) return;
  problem.value = null;
  resetForm({
    values: {
      kind: 'Weekend',
      leaveDate: '',
      leaveTime: '15:00',
      returnDate: '',
      returnTime: '18:00',
      reason: '',
      pickupPersonId: '',
    },
  });
});

const collectors = computed(() => [
  { value: '', label: 'Me / another parent' },
  ...props.pickups.map((p) => ({ value: p.id, label: `${p.name} (${p.relationship})` })),
]);
const reasonRequired = computed(() => REASON_REQUIRED.includes(values.kind ?? ''));

// The API names the combined times; show its messages on the date fields.
const FIELD_MAP: Record<string, string> = { leaveAt: 'leaveDate', returnBy: 'returnDate' };

const onSubmit = handleSubmit(async (form) => {
  problem.value = null;
  try {
    const res = await request.mutateAsync({
      kind: form.kind,
      reason: form.reason || undefined,
      leaveAt: `${form.leaveDate}T${form.leaveTime}`,
      returnBy: `${form.returnDate}T${form.returnTime}`,
      pickupPersonId: form.pickupPersonId || null,
    });
    toast.success(messageOf(res, 'Exeat requested. The boarding house will let you know.'));
    open.value = false;
  } catch (err) {
    const fields = fieldErrorsOf(err);
    if (Object.keys(fields).length) {
      setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [FIELD_MAP[k] ?? k, v])));
      return;
    }
    problem.value =
      errorCodeOf(err) === 'EXEAT_OVERLAP'
        ? getApiErrorMessage(err, `${props.firstName} already has an exeat at that time.`)
        : getApiErrorMessage(err, 'Your request wasn’t sent. Try again.');
  }
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="bottom"
      class="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-t-2xl px-5 pt-5 pb-7"
    >
      <SheetHeader class="p-0">
        <SheetTitle>Ask for an exeat</SheetTitle>
        <SheetDescription>
          The house master or mistress decides. We’ll let you know when they do.
        </SheetDescription>
      </SheetHeader>
      <form class="flex flex-col gap-3.5" novalidate @submit="onSubmit">
        <AlertCard v-if="problem" tone="error" title="Not sent" :text="problem" />
        <FormSelect name="kind" label="Kind of exeat" :options="EXEAT_KINDS" required />
        <div class="grid grid-cols-[3fr_2fr] gap-2.5">
          <FormInput
            name="leaveDate"
            label="Leaves on"
            type="date"
            placeholder="2026-12-04"
            required
          />
          <FormInput name="leaveTime" label="At" type="time" placeholder="15:00" required />
        </div>
        <div class="grid grid-cols-[3fr_2fr] gap-2.5">
          <FormInput
            name="returnDate"
            label="Back by"
            type="date"
            placeholder="2026-12-06"
            required
          />
          <FormInput name="returnTime" label="At" type="time" placeholder="18:00" required />
        </div>
        <FormTextarea
          name="reason"
          label="Reason"
          :required="reasonRequired"
          :placeholder="reasonRequired ? 'Dental appointment at Reddington Hospital' : 'Optional'"
          :rows="2"
        />
        <FormSelect
          name="pickupPersonId"
          label="Who collects"
          :options="collectors"
          hint="Only parents and people on the pickup list can collect at the gate."
        />
        <Button type="submit" size="lg" :disabled="request.isPending.value">
          <Spinner v-if="request.isPending.value" /> Send request
        </Button>
        <Button type="button" variant="outline" size="lg" @click="open = false">Cancel</Button>
      </form>
    </SheetContent>
  </Sheet>
</template>
