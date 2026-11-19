<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { watch } from 'vue';
import { messageOf } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import { useUpdateSchoolMutation } from '@/api/services/schools';
import FormCombobox from '@edutrack/app-kit/components/form/FormCombobox.vue';
import BrandColorPicker from '@edutrack/app-kit/components/form/BrandColorPicker.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import { DEFAULT_BRAND_COLOR } from '@edutrack/shared';
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
  brandColor: props.school.brandColor ?? DEFAULT_BRAND_COLOR,
});
const { handleSubmit, meta, resetForm, values } = useForm({
  validationSchema: editSchoolSchema,
  initialValues: initial(),
});
watch(open, (isOpen) => isOpen && resetForm({ values: initial() }));

const save = handleSubmit(async (values) => {
  const saved = await update.mutateAsync({ ...values, phone: values.phone ?? '' });
  open.value = false;
  toast.success(messageOf(saved, 'School updated.'));
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Edit ${school.name}`"
    description="Tenant details and brand color. The school manages the rest of its profile inside its workspace."
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
      <BrandColorPicker
        :school-name="values.name || school.name"
        description="Themes the school’s workspace, its sign-in pages and the teacher, parent and student portals. The school’s admins can also change it in School Profile."
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
