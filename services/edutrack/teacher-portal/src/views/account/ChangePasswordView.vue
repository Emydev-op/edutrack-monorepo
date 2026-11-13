<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';

import { useChangePasswordMutation } from '@/api/services/auth';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { changePasswordSchema } from '@/schema/auth';

const router = useRouter();
const change = useChangePasswordMutation();
const serverError = ref('');
const done = ref(false);

const { handleSubmit, values, meta } = useForm({
  validationSchema: changePasswordSchema,
  initialValues: { current: '', password: '', confirmPassword: '' },
});
useUnsavedWork(() => meta.value.dirty && !done.value, 'New password');

const onSubmit = handleSubmit(async (v) => {
  serverError.value = '';
  if (v.password === v.current) {
    serverError.value = 'Choose a password you haven’t just used.';
    return;
  }
  try {
    const { signedOut } = await change.mutateAsync({ current: v.current, next: v.password });
    done.value = true;
    toast.success(
      signedOut
        ? `Password updated. ${signedOut} other device${signedOut === 1 ? ' was' : 's were'} signed out.`
        : 'Password updated.',
    );
    await router.push({ name: routesPath.profile.view.name });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'Your password wasn’t changed. Try again.');
  }
});
</script>

<template>
  <PageHeader
    title="Change password"
    description="You stay signed in here. Every other device is signed out."
  />
  <SectionCard class="max-w-lg">
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="current"
        label="Current password"
        type="password"
        autocomplete="current-password"
        placeholder="Your current password"
      />
      <FormInput
        name="password"
        label="New password"
        type="password"
        autocomplete="new-password"
        placeholder="At least 8 characters"
      >
        <template #after><PasswordChecklist :password="values.password ?? ''" /></template>
      </FormInput>
      <FormInput
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autocomplete="new-password"
        placeholder="Re-enter the new password"
      />
      <p
        v-if="serverError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ serverError }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="change.isPending.value">
          <Spinner v-if="change.isPending.value" />
          {{ change.isPending.value ? 'Updating…' : 'Update password' }}
        </Button>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.profile.view.name }">Cancel</RouterLink></Button
        >
      </div>
    </form>
  </SectionCard>
</template>
