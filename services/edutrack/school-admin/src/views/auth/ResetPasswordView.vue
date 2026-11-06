<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { isAxiosError } from 'axios';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useResetPasswordMutation } from '@/api/services/auth';
import ResultIcon from '@edutrack/app-kit/components/common/ResultIcon.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { routesPath } from '@/router/routes-path';
import { resetPasswordSchema } from '@/schema/auth';

import AuthHeading from './AuthHeading.vue';

const route = useRoute();
const router = useRouter();
const token = computed(() => (route.query.token as string | undefined) ?? '');
const reset = useResetPasswordMutation();
const linkProblem = ref<'expired' | 'invalid' | null>(token.value ? null : 'invalid');

const { handleSubmit, values } = useForm({
  validationSchema: resetPasswordSchema,
  initialValues: { password: '', confirmPassword: '' },
});

const onSubmit = handleSubmit(async ({ password }) => {
  try {
    await reset.mutateAsync({ token: token.value, password });
    await router.replace({ name: routesPath.auth.resetDone.name });
  } catch (err) {
    const status = isAxiosError(err) ? err.response?.status : undefined;
    if (status === 410) linkProblem.value = 'expired';
    else if (status === 400) linkProblem.value = 'invalid';
    else throw err;
  }
});

const PROBLEMS = {
  expired: {
    title: 'This reset link has expired',
    text: 'Reset links work for 60 minutes and only once. Request a new link to continue.',
  },
  invalid: {
    title: "This reset link isn't valid",
    text: 'The link may be incomplete or already used. Copy the whole link from the email, or request a new one.',
  },
};
</script>

<template>
  <AuthLayout>
    <template v-if="linkProblem">
      <ResultIcon tone="error" centered />
      <AuthHeading
        :title="PROBLEMS[linkProblem].title"
        :description="PROBLEMS[linkProblem].text"
        centered
      />
      <Button as-child size="lg"
        ><RouterLink :to="{ name: routesPath.auth.forgot.name }"
          >Request a new link</RouterLink
        ></Button
      >
      <RouterLink
        :to="{ name: routesPath.auth.login.name }"
        class="self-center text-[13px] text-primary hover:underline"
        >Back to sign in</RouterLink
      >
    </template>

    <template v-else>
      <AuthHeading
        title="Create a new password"
        description="Choose a password you haven't used here before."
      />
      <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
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
          placeholder="Re-enter the password"
        />
        <Button type="submit" size="lg" :disabled="reset.isPending.value">
          <Spinner v-if="reset.isPending.value" />
          {{ reset.isPending.value ? 'Updating…' : 'Update password' }}
        </Button>
      </form>
    </template>
  </AuthLayout>
</template>
