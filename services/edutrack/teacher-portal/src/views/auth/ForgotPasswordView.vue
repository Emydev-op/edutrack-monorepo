<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { ArrowLeftIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { RouterLink, useRouter } from 'vue-router';

import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';

import { useForgotPasswordMutation } from '@/api/services/auth';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { routesPath } from '@/router/routes-path';
import { forgotPasswordSchema } from '@/schema/auth';

import AuthHeading from './AuthHeading.vue';

const router = useRouter();
const forgot = useForgotPasswordMutation();
const { handleSubmit } = useForm({ validationSchema: forgotPasswordSchema });

const onSubmit = handleSubmit(async ({ email }) => {
  await forgot.mutateAsync(email);
  await router.push({ name: routesPath.auth.forgotSent.name, query: { email } });
});
</script>

<template>
  <AuthLayout>
    <AuthHeading
      title="Reset your password"
      description="Enter your work email address and we'll send you a password reset link."
    />
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="email"
        label="Email address"
        type="email"
        autocomplete="email"
        placeholder="name@greenfield.edu.ng"
      />
      <Button type="submit" size="lg" :disabled="forgot.isPending.value">
        <Spinner v-if="forgot.isPending.value" />
        {{ forgot.isPending.value ? 'Sending…' : 'Send reset link' }}
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
