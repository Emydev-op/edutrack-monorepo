<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { watch } from 'vue';
import { toast } from 'vue-sonner';

import { useInviteSchoolAdminMutation } from '@/api/services/schools';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { inviteSchoolAdminSchema } from '@/schema/school';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const open = defineModel<boolean>('open', { required: true });
const invite = useInviteSchoolAdminMutation(() => props.school.id);

const { handleSubmit, meta, resetForm } = useForm({
  validationSchema: inviteSchoolAdminSchema,
  initialValues: { name: '', email: '', role: 'School Admin' as const, scope: 'All branches' },
});
watch(open, (isOpen) => isOpen && resetForm());

const send = handleSubmit(async (values) => {
  await invite.mutateAsync(values);
  open.value = false;
  toast.success(`Invitation sent to ${values.email}.`);
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Invite administrator · ${school.name}`"
    description="They get School Admin access to this school only."
    :dirty="meta.dirty"
  >
    <form id="invite-school-admin" class="flex flex-col gap-3.5" novalidate @submit="send">
      <FormInput name="name" label="Full name" required placeholder="Osegbo Emeka" />
      <FormInput
        name="email"
        label="Email"
        type="email"
        required
        placeholder="e.osegbo@crestviewcollege.ng"
      />
      <FormSelect name="role" label="Role" :options="['School Admin', 'Owner']" />
      <FormSelect
        name="scope"
        label="Branch scope"
        :options="['All branches', 'Main Campus only']"
      />
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="invite-school-admin" :disabled="invite.isPending.value"
        ><Spinner v-if="invite.isPending.value" />Send invitation</Button
      >
    </template>
  </SideDrawer>
</template>
