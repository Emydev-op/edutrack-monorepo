<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { watch } from 'vue';
import { toast } from 'vue-sonner';

import { useUpdateSchoolMutation } from '@/api/services/schools';
import FormCombobox from '@edutrack/app-kit/components/form/FormCombobox.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { NIGERIAN_STATES } from '@/config/options';
import { editSchoolSchema } from '@/schema/school';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const open = defineModel<boolean>('open', { required: true });
const update = useUpdateSchoolMutation(() => props.school.id);

const initial = () => ({
  name: props.school.name,
  contactEmail: props.school.contactEmail,
  phone: props.school.phone,
  state: props.school.state,
});
const { handleSubmit, meta, resetForm } = useForm({
  validationSchema: editSchoolSchema,
  initialValues: initial(),
});
watch(open, (isOpen) => isOpen && resetForm({ values: initial() }));

const save = handleSubmit(async (values) => {
  await update.mutateAsync({ ...values, phone: values.phone ?? '' });
  open.value = false;
  toast.success('School updated.');
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Edit ${school.name}`"
    description="Tenant details. The school manages its own profile inside its workspace."
    :dirty="meta.dirty"
  >
    <form id="edit-school" class="flex flex-col gap-3.5" novalidate @submit="save">
      <FormInput name="name" label="Display name" required placeholder="Crestview College" />
      <FormInput
        name="contactEmail"
        label="Contact email"
        type="email"
        required
        placeholder="info@crestviewcollege.ng"
      />
      <FormInput name="phone" label="Phone" type="tel" placeholder="0809 555 0123" />
      <FormCombobox
        name="state"
        label="State"
        required
        :options="NIGERIAN_STATES"
        placeholder="Select a state"
        search-placeholder="Search states"
      />
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="edit-school" :disabled="update.isPending.value"
        ><Spinner v-if="update.isPending.value" />Save changes</Button
      >
    </template>
  </SideDrawer>
</template>
