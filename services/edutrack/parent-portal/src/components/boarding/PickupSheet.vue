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
import { ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import { messageOf } from '@edutrack/web-core/http';

import { useAddPickupMutation } from '@/api/services/boarding';
import AlertCard from '@/components/common/AlertCard.vue';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { pickupSchema } from '@/schema/boarding';

/** Add someone to the boarder's pickup list. */
const props = defineProps<{ childId: string; firstName: string }>();
const open = defineModel<boolean>('open', { default: false });

const add = useAddPickupMutation(() => props.childId);
const problem = ref<string | null>(null);
const { handleSubmit, resetForm, setErrors } = useForm({ validationSchema: pickupSchema });
watch(open, (isOpen) => {
  if (!isOpen) return;
  problem.value = null;
  resetForm({ values: { name: '', relationship: '', phone: '', note: '' } });
});

const onSubmit = handleSubmit(async (form) => {
  problem.value = null;
  try {
    const res = await add.mutateAsync({
      name: form.name,
      relationship: form.relationship,
      phone: form.phone,
      note: form.note || undefined,
    });
    toast.success(messageOf(res, `${form.name} can now collect ${props.firstName}.`));
    open.value = false;
  } catch (err) {
    const fields = fieldErrorsOf(err);
    if (Object.keys(fields).length) setErrors(fields);
    else problem.value = getApiErrorMessage(err, 'They weren’t added. Try again.');
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
        <SheetTitle>Add a pickup person</SheetTitle>
        <SheetDescription>
          The gate checks their name and phone before {{ firstName }} leaves with them.
        </SheetDescription>
      </SheetHeader>
      <form class="flex flex-col gap-3.5" novalidate @submit="onSubmit">
        <AlertCard v-if="problem" tone="error" title="Not added" :text="problem" />
        <FormInput
          name="name"
          label="Full name"
          placeholder="Chinedu Okafor"
          autocomplete="off"
          required
        />
        <FormInput name="relationship" label="Relationship" placeholder="Uncle" required />
        <FormInput
          name="phone"
          label="Mobile number"
          type="tel"
          inputmode="tel"
          placeholder="0803 555 0161"
          required
        />
        <FormInput
          name="note"
          label="Note"
          placeholder="Drives a grey Corolla, LSR 123 AB"
          hint="Anything that helps the gate recognise them, like a car plate."
        />
        <Button type="submit" size="lg" :disabled="add.isPending.value">
          <Spinner v-if="add.isPending.value" /> Add to the list
        </Button>
        <Button type="button" variant="outline" size="lg" @click="open = false">Cancel</Button>
      </form>
    </SheetContent>
  </Sheet>
</template>
