<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';

import { useLoginMutation } from '@/api/services/auth';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { DEMO_ACCOUNTS, DEMO_CREDENTIALS } from '@/config/demo';
import { env } from '@/config/env';
import { errorCodeOf, getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { loginSchema } from '@/schema/auth';
import { useAuthStore } from '@/stores/auth';
import type { AccountBlock } from '@/types';

import AuthHeading from './AuthHeading.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const login = useLoginMutation();

const { handleSubmit, defineField, setFieldValue, values } = useForm({
  validationSchema: loginSchema,
  initialValues: {
    email:
      (route.query.email as string | undefined) ?? (env.useMocks ? DEMO_CREDENTIALS.email : ''),
    password: env.useMocks ? DEMO_CREDENTIALS.password : '',
    remember: true,
  },
});
const [remember] = defineField('remember');

const block = ref<AccountBlock | null>(null);
const blockMessage = ref('');
const error = ref('');

type Notice = {
  tone: 'warning' | 'error' | 'info' | 'neutral' | 'success';
  title: string;
  text: string;
};
const OFFICE = 'Contact the school office if you think this is a mistake.';
const NOTICES: Record<AccountBlock | 'expired' | 'signedout' | 'reset', Notice> = {
  expired: {
    tone: 'info',
    title: 'Your session has ended. Please sign in again.',
    text: 'For your security you’re signed out after a period of inactivity, or when your password changes on another device.',
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
    title: 'Your teacher account is suspended.',
    text: OFFICE,
  },
  ACCOUNT_PENDING: {
    tone: 'warning',
    title: 'Your teacher account isn’t activated yet.',
    text: 'Open the invitation your school sent you to set your password. If you can’t find it, ask the school office to resend it.',
  },
  ACCOUNT_DEACTIVATED: {
    tone: 'neutral',
    title: 'This teacher account is no longer active.',
    text: OFFICE,
  },
  ACCOUNT_LOCKED: {
    tone: 'error',
    title: 'Too many unsuccessful attempts. Please wait before trying again.',
    text: 'Sign-in is paused for 15 minutes on this account. You can still reset your password.',
  },
  PASSWORD_EXPIRED: {
    tone: 'warning',
    title: 'Your password has expired.',
    text: 'Your school asks for a new password every 90 days. Set a new one to continue.',
  },
};
const reason = route.query.reason as string | undefined;
const notice = computed<Notice | null>(() => {
  if (block.value) {
    const base = NOTICES[block.value];
    // Suspended and deactivated accounts show the school's reason.
    const withReason = block.value === 'ACCOUNT_SUSPENDED' || block.value === 'ACCOUNT_DEACTIVATED';
    return withReason && blockMessage.value
      ? { ...base, text: `${blockMessage.value} ${base.text}` }
      : base;
  }
  return reason === 'expired' || reason === 'signedout' || reason === 'reset'
    ? NOTICES[reason]
    : null;
});

const onSubmit = handleSubmit(async (form) => {
  block.value = null;
  error.value = '';
  try {
    const session = await login.mutateAsync(form);
    auth.setSession(
      { token: session.accessToken, user: session.user, school: session.school },
      form.remember,
    );
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    await router.replace(redirect ?? { name: routesPath.dashboard.name });
  } catch (err) {
    const code = errorCodeOf(err);
    if (code && code in NOTICES) {
      block.value = code as AccountBlock;
      blockMessage.value = getApiErrorMessage(err, '');
    } else error.value = getApiErrorMessage(err, 'We couldn’t sign you in. Try again.');
  }
});

function useDemo(email: string) {
  setFieldValue('email', email);
  setFieldValue('password', DEMO_CREDENTIALS.password);
  block.value = null;
  error.value = '';
}
</script>

<template>
  <AuthLayout>
    <AuthHeading
      title="Teacher Workspace"
      :description="`Sign in to your classes at ${env.schoolName}.`"
    />
    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.text"
      role="alert"
    >
      <template v-if="block === 'ACCOUNT_LOCKED'" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.auth.forgot.name }"
            >Reset password</RouterLink
          ></Button
        >
      </template>
      <template v-else-if="block === 'PASSWORD_EXPIRED'" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{ name: routesPath.auth.passwordExpired.name, query: { email: values.email } }"
            >Set a new password</RouterLink
          ></Button
        >
      </template>
      <template v-else-if="block === 'ACCOUNT_PENDING' && env.useMocks" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{
              name: routesPath.auth.acceptInvitation.name,
              params: { token: DEMO_CREDENTIALS.invitation },
            }"
            >Open invitation</RouterLink
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
    </form>
    <div v-if="env.useMocks" class="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <p class="text-xs text-faint">
        Mock API: every demo account uses the prefilled password. Five wrong passwords pause
        sign-in.
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="a in DEMO_ACCOUNTS"
          :key="a.email"
          type="button"
          class="rounded-sm border bg-card px-2 py-1 text-left text-xs hover:bg-muted"
          :title="a.email"
          @click="useDemo(a.email)"
        >
          {{ a.label }}
        </button>
        <RouterLink
          :to="{
            name: routesPath.auth.acceptInvitation.name,
            params: { token: DEMO_CREDENTIALS.invitation },
          }"
          class="rounded-sm border bg-card px-2 py-1 text-xs hover:bg-muted"
          >Invitation link</RouterLink
        >
      </div>
    </div>
    <p class="text-[13px] text-muted-foreground">
      New teacher? Your school sends you an invitation by email. Can’t sign in? Ask the school
      office.
    </p>
  </AuthLayout>
</template>
