<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { ArrowLeftIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';

import { useExpiredPasswordMutation } from '@/api/services/auth';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { expiredPasswordSchema } from '@/schema/auth';
import { useAuthStore } from '@/stores/auth';

import AuthHeading from './AuthHeading.vue';

/** Sign-in said the password expired: confirm the old one, choose a new one, carry on. */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const update = useExpiredPasswordMutation();
const error = ref('');

const { handleSubmit, values } = useForm({
  validationSchema: expiredPasswordSchema,
  initialValues: {
    email: (route.query.email as string | undefined) ?? '',
    current: '',
    password: '',
    confirmPassword: '',
  },
});

const onSubmit = handleSubmit(async (form) => {
  error.value = '';
  try {
    const session = await update.mutateAsync({
      email: form.email,
      current: form.current,
      next: form.password,
    });
    auth.setSession(
      { token: session.accessToken, user: session.user, school: session.school },
      false,
    );
    await router.replace({ name: routesPath.dashboard.name });
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Your password wasn’t changed. Try again.');
  }
});
</script>

<template>
  <AuthLayout>
    <AuthHeading
      title="Set a new password"
      description="Your password has expired. Confirm your current password, then choose a new one you haven’t used here before."
    />
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="email"
        label="Work email"
        type="email"
        autocomplete="username"
        placeholder="name@greenfield.edu.ng"
      />
      <FormInput
        name="current"
        label="Current password"
        type="password"
        autocomplete="current-password"
        placeholder="The password that expired"
      />
      <FormInput
        name="password"
        label="New password"
        type="password"
        autocomplete="new-password"
        placeholder="At least 10 characters"
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
        v-if="error"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ error }}
      </p>
      <Button type="submit" size="lg" :disabled="update.isPending.value">
        <Spinner v-if="update.isPending.value" />
        {{ update.isPending.value ? 'Updating…' : 'Update password and sign in' }}
      </Button>
    </form>
    <RouterLink
      :to="{ name: routesPath.auth.login.name }"
      class="flex items-center gap-1 text-[13px] text-primary hover:underline"
    >
      <ArrowLeftIcon class="size-3.5" /> Back to sign in
    </RouterLink>
  </AuthLayout>
</template>
