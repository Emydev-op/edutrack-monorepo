<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { watch } from 'vue';
import { messageOf } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import { useSmsTopUpMutation } from '@/api/services/sms';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { smsTopUpSchema } from '@/schema/school';
import type { School } from '@/types';

const props = defineProps<{ school: School; balance: number }>();
const open = defineModel<boolean>('open', { required: true });
const topUp = useSmsTopUpMutation(() => props.school.id);

const { handleSubmit, meta, resetForm } = useForm({ validationSchema: smsTopUpSchema });
watch(open, (isOpen) => isOpen && resetForm());

const save = handleSubmit(async (values) => {
  const saved = await topUp.mutateAsync({
    units: values.units,
    reference: values.reference ?? '',
    note: values.note,
  });
  open.value = false;
  toast.success(messageOf(saved, 'SMS units added.'));
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Add SMS units for ${school.name}`"
    :description="`Record units the school paid for. They're added to the balance at once (${formatCount(balance)} now), the school's admins are told in School Admin, and the top-up is audited.`"
    :dirty="meta.dirty"
  >
    <form id="sms-top-up" class="flex flex-col gap-3.5" novalidate @submit="save">
      <FormNumber name="units" label="Units" required placeholder="5,000" suffix="units" />
      <FormInput
        name="reference"
        label="Payment reference"
        placeholder="PAY-2026-0418"
        hint="The invoice or transfer it was paid with, if any."
      />
      <FormTextarea
        name="note"
        label="Note"
        required
        :rows="3"
        placeholder="Paid for 5,000 units by transfer on 18 Nov"
      />
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="sms-top-up" :disabled="topUp.isPending.value"
        ><Spinner v-if="topUp.isPending.value" />Add units</Button
      >
    </template>
  </SideDrawer>
</template>
