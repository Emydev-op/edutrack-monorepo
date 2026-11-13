<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useQueryClient } from '@tanstack/vue-query';
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
const queryClient = useQueryClient();
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

type Notice = {
  tone: 'warning' | 'error' | 'info' | 'neutral' | 'success';
  title: string;
  text: string;
};
const CONTACT = 'Contact platform support at support@schoolplatform.ng or +234 1 700 2200.';
const NOTICES: Record<AccountBlock | 'expired' | 'signedout' | 'reset', Notice> = {
  expired: {
    tone: 'info',
    title: 'Your session has expired. Please sign in again.',
    text: 'For your security you’re signed out after 30 minutes of inactivity.',
  },
  signedout: {
    tone: 'success',
    title: 'You have signed out.',
    text: 'Sign in again whenever you’re ready.',
  },
  reset: {
    tone: 'success',
    title: 'Your password has been updated.',
    text: 'Sign in with your new password. Other devices have been signed out.',
  },
  ACCOUNT_SUSPENDED: {
    tone: 'error',
    title: 'Your school account has been temporarily suspended.',
    text: CONTACT,
  },
  ACCOUNT_PENDING: {
    tone: 'warning',
    title: 'Your school account has not been activated yet.',
    text: 'Open the invitation you were sent to finish setting up. If you can’t find it, it can be resent.',
  },
  ACCOUNT_DEACTIVATED: {
    tone: 'neutral',
    title: 'This school account is no longer active.',
    text: CONTACT,
  },
  ACCOUNT_LOCKED: {
    tone: 'error',
    title: 'Too many unsuccessful attempts. Please wait before trying again.',
    text: 'Sign-in is paused for 15 minutes on this account. You can still reset your password.',
  },
  PASSWORD_EXPIRED: {
    tone: 'warning',
    title: 'Your password has expired.',
    text: 'Your school requires a new password every 90 days. Reset it to continue.',
  },
};
const reason = route.query.reason as string | undefined;
const notice = computed(() =>
  block.value
    ? NOTICES[block.value]
    : reason === 'expired' || reason === 'signedout' || reason === 'reset'
      ? NOTICES[reason]
      : null,
);
/** Blocks where resetting the password is the way forward. */
const offerReset = computed(
  () => block.value === 'ACCOUNT_LOCKED' || block.value === 'PASSWORD_EXPIRED',
);

const onSubmit = handleSubmit(async (values) => {
  block.value = null;
  error.value = '';
  try {
    const session = await login.mutateAsync(values);
    // A session can end by expiring, without the sign-out menu: never show the previous
    // person's cached data to whoever signs in next on this device.
    queryClient.clear();
    auth.setSession(
      { token: session.accessToken, user: session.user, school: session.school },
      values.remember,
    );
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
    <AuthHeading title="School Admin" :description="`Sign in to manage ${env.schoolName}.`" />
    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.text"
      role="alert"
    >
      <template v-if="offerReset" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.auth.forgot.name }"
            >Reset password</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="email"
        label="Work email"
        type="email"
        autocomplete="username"
        placeholder="name@greenfield.edu.ng"
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
        Mock API: demo credentials are prefilled. {{ DEMO_CREDENTIALS.newSchool }} opens a school
        with no data yet. To see blocked accounts, try {{ DEMO_CREDENTIALS.suspended }},
        {{ DEMO_CREDENTIALS.deactivated }}, {{ DEMO_CREDENTIALS.pending }} or
        {{ DEMO_CREDENTIALS.passwordExpired }}. Five wrong passwords pause sign-in.
      </p>
    </form>
    <p class="text-[13px] text-muted-foreground">
      Can’t access your account? Contact platform support at
      <a href="mailto:support@schoolplatform.ng" class="font-medium text-primary hover:underline"
        >support@schoolplatform.ng</a
      >.
    </p>
  </AuthLayout>
</template>
