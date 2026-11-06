<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';

import { useInviteUserMutation, useRolesQuery } from '@/api/services/users';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useSuccessDialog } from '@edutrack/app-kit/composables/useSuccessDialog';
import { routesPath } from '@/router/routes-path';
import { inviteUserDetailsSchema } from '@/schema/user';
import { PERMISSION_AREAS } from '@/types';

const open = defineModel<boolean>('open', { required: true });

const { data: roles } = useRolesQuery();
const invite = useInviteUserMutation();
const success = useSuccessDialog();

const step = ref(0);
const roleId = ref('agent');
const error = ref('');
const { handleSubmit, values, meta, resetForm } = useForm({
  validationSchema: inviteUserDetailsSchema,
  // The details step unmounts on Continue; keep its values for the review and the request.
  keepValuesOnUnmount: true,
  initialValues: { firstName: '', lastName: '', email: '', phone: '' },
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  step.value = 0;
  roleId.value = 'agent';
  error.value = '';
  resetForm();
});

const roleChoices = computed(() =>
  (roles.value ?? []).map((r) => {
    const areas = PERMISSION_AREAS.filter((a) => (r.permissions[a] ?? []).length);
    return {
      value: r.id,
      label: r.name,
      description: r.description,
      detail:
        areas.length === PERMISSION_AREAS.length
          ? 'Access to every area'
          : `Access: ${areas.join(', ') || 'none'}`,
    };
  }),
);
const roleName = computed(() => roles.value?.find((r) => r.id === roleId.value)?.name ?? '');

const next = handleSubmit(() => (step.value = 1));

async function send() {
  error.value = '';
  try {
    const user = await invite.mutateAsync({
      ...values,
      phone: values.phone ?? '',
      firstName: values.firstName!,
      lastName: values.lastName!,
      email: values.email!,
      roleId: roleId.value,
    });
    open.value = false;
    success.show({
      title: 'Invitation sent',
      description: `${user.firstName} will receive an email at ${user.email} to join as ${roleName.value}. The link expires in 7 days.`,
      primary: { label: 'Done', to: { name: routesPath.users.list.name } },
      secondary: {
        label: 'Preview their invitation',
        to: { name: routesPath.auth.acceptInvitation.name, params: { token: user.id } },
      },
    });
  } catch (err) {
    error.value = getApiErrorMessage(err);
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Invite user"
    description="They receive an email to accept the invitation and create their account."
    :dirty="meta.dirty"
  >
    <StepIndicator :steps="['Details', 'Role', 'Review']" :current="step" size="sm" />
    <p
      v-if="error"
      role="alert"
      class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
    >
      {{ error }}
    </p>

    <form
      v-if="step === 0"
      id="invite-details"
      class="flex flex-col gap-3.5"
      novalidate
      @submit="next"
    >
      <FormInput name="firstName" label="First name" required placeholder="Emeka" />
      <FormInput name="lastName" label="Last name" required placeholder="Osegbo" />
      <FormInput
        name="email"
        label="Email"
        type="email"
        required
        hint="Use an @edutrack.ng address."
        placeholder="osegbo.emeka@edutrack.ng"
      />
      <FormInput name="phone" label="Phone (optional)" type="tel" placeholder="0803 555 0123" />
    </form>

    <div v-else-if="step === 1" class="flex flex-col gap-1.5 text-[13px] font-medium">
      <span>Role <span class="text-destructive">*</span></span>
      <ChoiceCards v-model="roleId" :choices="roleChoices" label="Role" />
      <span class="text-xs font-normal text-warning-strong"
        >You can change the role later. Create new roles in Settings.</span
      >
    </div>

    <dl
      v-else
      class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 rounded-md bg-muted px-3.5 py-3 text-[13px]"
    >
      <dt class="text-faint">Name</dt>
      <dd>{{ values.firstName }} {{ values.lastName }}</dd>
      <dt class="text-faint">Email</dt>
      <dd>{{ values.email }}</dd>
      <dt class="text-faint">Phone</dt>
      <dd>{{ values.phone || '—' }}</dd>
      <dt class="text-faint">Role</dt>
      <dd>{{ roleName }}</dd>
      <dt class="text-faint">Link expires</dt>
      <dd>7 days after sending</dd>
    </dl>

    <template #footer>
      <Button
        variant="outline"
        :disabled="invite.isPending.value"
        @click="step ? step-- : (open = false)"
        >{{ step ? 'Back' : 'Cancel' }}</Button
      >
      <Button v-if="step === 0" type="submit" form="invite-details">Continue</Button>
      <Button v-else-if="step === 1" @click="step = 2">Continue</Button>
      <Button v-else :disabled="invite.isPending.value" @click="send">
        <Spinner v-if="invite.isPending.value" />
        {{ invite.isPending.value ? 'Sending…' : 'Send invitation' }}
      </Button>
    </template>
  </SideDrawer>
</template>
