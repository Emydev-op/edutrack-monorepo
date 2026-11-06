<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { isAxiosError } from 'axios';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useLoginMutation } from '@/api/services/auth';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { env } from '@/config/env';
import { DEMO_CREDENTIALS } from '@/config/demo';
import { routesPath } from '@/router/routes-path';
import { loginSchema } from '@/schema/auth';
import { useAuthStore } from '@/stores/auth';
import type { AccountBlock } from '@/types';

import AuthHeading from './AuthHeading.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const login = useLoginMutation();

const { handleSubmit, defineField } = useForm({
  validationSchema: loginSchema,
  initialValues: {
    email:
      (route.query.email as string | undefined) ?? (env.useMocks ? DEMO_CREDENTIALS.email : ''),
    password: env.useMocks && !route.query.email ? DEMO_CREDENTIALS.password : '',
    remember: true,
  },
});
const [remember] = defineField('remember');

const block = ref<AccountBlock | null>(null);
const error = ref('');

const NOTICES: Record<
  AccountBlock | 'expired',
  { tone: 'warning' | 'error' | 'info' | 'neutral'; title: string; text: string }
> = {
  expired: {
    tone: 'warning',
    title: 'Your session has expired',
    text: 'For security, you were signed out after 30 minutes without activity. Please sign in again.',
  },
  ACCOUNT_SUSPENDED: {
    tone: 'error',
    title: 'This account is suspended',
    text: "You can't sign in while your account is suspended. Contact a Platform Administrator at admin@edutrack.ng.",
  },
  ACCOUNT_PENDING: {
    tone: 'info',
    title: 'This account isn’t activated yet',
    text: 'Open the invitation email and create your password first. Ask the person who invited you to resend it if the link has expired.',
  },
  ACCOUNT_DEACTIVATED: {
    tone: 'neutral',
    title: 'This account has been deactivated',
    text: "Deactivated accounts can't be used to sign in. If you've returned to EduTrack, ask an administrator to send a new invitation.",
  },
};
const notice = computed(() =>
  block.value ? NOTICES[block.value] : route.query.reason === 'expired' ? NOTICES.expired : null,
);

const onSubmit = handleSubmit(async (values) => {
  block.value = null;
  error.value = '';
  try {
    const session = await login.mutateAsync(values);
    auth.setSession({ token: session.accessToken, user: session.user }, values.remember);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    await router.replace(redirect ?? { name: routesPath.dashboard.name });
  } catch (err) {
    const code = isAxiosError(err)
      ? (err.response?.data as { error?: string } | undefined)?.error
      : undefined;
    if (code && code in NOTICES) block.value = code as AccountBlock;
    else error.value = getApiErrorMessage(err, 'We couldn’t sign you in. Try again.');
  }
});
</script>

<template>
  <AuthLayout>
    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.text"
      role="alert"
    />
    <AuthHeading
      title="Sign in"
      description="Sign in to the EduTrack platform administration portal."
    />
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="email"
        label="Work email"
        type="email"
        autocomplete="username"
        placeholder="you@edutrack.ng"
      />
      <FormInput
        name="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        placeholder="Enter your password"
      >
        <template #label-aside>
          <RouterLink
            :to="{ name: routesPath.auth.forgot.name }"
            class="font-medium text-primary hover:underline"
            >Forgot password?</RouterLink
          >
        </template>
      </FormInput>
      <p
        v-if="error"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ error }}
      </p>
      <label class="flex items-center gap-2 text-[13px]">
        <Checkbox v-model="remember" />
        Remember this device for 30 days
      </label>
      <Button type="submit" size="lg" :disabled="login.isPending.value">
        <Spinner v-if="login.isPending.value" />
        {{ login.isPending.value ? 'Signing in…' : 'Sign in' }}
      </Button>
      <p v-if="env.useMocks" class="text-xs text-faint">
        Mock API: demo credentials are prefilled. Try {{ DEMO_CREDENTIALS.suspended }} or
        {{ DEMO_CREDENTIALS.deactivated }} to see blocked accounts.
      </p>
    </form>
  </AuthLayout>
</template>
