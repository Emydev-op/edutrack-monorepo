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
import { errorCodeOf, getApiErrorMessage } from '@/lib/api-errors';
import { useSchoolBrand } from '@/lib/school-brand';
import { safeRedirect } from '@/router/guards';
import { routesPath } from '@/router/routes-path';
import { loginSchema } from '@/schema/auth';
import { useAuthStore } from '@/stores/auth';
import type { AccountBlock } from '@/types';

import AuthHeading from './AuthHeading.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const login = useLoginMutation();
const school = useSchoolBrand();

const { handleSubmit, defineField, setFieldValue, values } = useForm({
  validationSchema: loginSchema,
  initialValues: {
    email: (route.query.email as string | undefined) ?? '',
    password: '',
    remember: false,
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
const OFFICE = 'Please ask your class teacher or the school office for help.';
type Reason = 'expired' | 'signedout' | 'lapsed' | 'idle' | 'left';
const NOTICES: Record<AccountBlock | Reason, Notice> = {
  idle: {
    tone: 'info',
    title: 'You were signed out after a period of inactivity.',
    text: 'For your security the portal signs you out when it isn’t used for a while. Sign in again to continue.',
  },
  expired: {
    tone: 'info',
    title: 'Your session has expired. Please sign in again.',
    text: 'For your security you’re signed out after a period of inactivity, or when your password changes on another device.',
  },
  signedout: {
    tone: 'success',
    title: 'You have signed out.',
    text: 'Sign in again whenever you’re ready.',
  },
  ACCOUNT_SUSPENDED: {
    tone: 'error',
    title: 'Your student login has been suspended.',
    text: OFFICE,
  },
  ACCOUNT_PENDING: {
    tone: 'warning',
    title: 'Your student login hasn’t been activated yet.',
    text: 'Your school gives you a login slip with your admission number and a one-time password. Ask your class teacher if you haven’t had one.',
  },
  ACCOUNT_DEACTIVATED: {
    tone: 'neutral',
    title: 'This student login is no longer active.',
    text: OFFICE,
  },
  ACCOUNT_LOCKED: {
    tone: 'error',
    title: 'Too many unsuccessful attempts. Please wait before trying again.',
    text: 'Sign-in is paused for 15 minutes on this account. If you’ve forgotten your password, ask the school office for a new login slip.',
  },
  PASSWORD_EXPIRED: {
    tone: 'warning',
    title: 'Set a new password to continue.',
    text: 'Choose a new password the first time you sign in, or when your old one expires.',
  },
  SUBSCRIPTION_LAPSED: {
    tone: 'warning',
    title: 'The Student Portal is closed for now.',
    text: 'It opens again as soon as the school renews its EduTrack subscription.',
  },
  lapsed: {
    tone: 'warning',
    title: 'The Student Portal is closed for now.',
    text: 'You’ve been signed out. It opens again as soon as the school renews its EduTrack subscription.',
  },
  SCHOOL_SUSPENDED: {
    tone: 'error',
    title: 'The school’s access to EduTrack is suspended.',
    text: OFFICE,
  },
  STUDENT_LOGINS_OFF: {
    tone: 'neutral',
    title: 'Student Portal sign-in is turned off for your class.',
    text: 'Your school decides which classes use the Student Portal. Ask your class teacher.',
  },
  STUDENT_LEFT: {
    tone: 'neutral',
    title: 'Your student login has closed.',
    text: 'You’ve left the school, so you can’t sign in to the Student Portal any more. Your parents or guardians can still see your past records.',
  },
  left: {
    tone: 'neutral',
    title: 'Your student login has closed.',
    text: 'You’ve left the school, so you’ve been signed out.',
  },
  NO_ACCESS: {
    tone: 'error',
    title: 'We couldn’t access this account.',
    text: 'This isn’t a student login at this school. Check the school’s address on your login slip, or ask the school office.',
  },
};
const REASONS: Reason[] = ['expired', 'signedout', 'lapsed', 'idle', 'left'];
const reason = route.query.reason as Reason | undefined;
const notice = computed<Notice | null>(() => {
  if (block.value) {
    const base = NOTICES[block.value];
    // Suspended and deactivated accounts show the school's reason.
    const withReason = block.value === 'ACCOUNT_SUSPENDED' || block.value === 'ACCOUNT_DEACTIVATED';
    return withReason && blockMessage.value
      ? { ...base, text: `${blockMessage.value} ${base.text}` }
      : base;
  }
  return reason && REASONS.includes(reason) ? NOTICES[reason] : null;
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
    await router.replace(safeRedirect(route.query.redirect) ?? { name: routesPath.home.name });
  } catch (err) {
    const code = errorCodeOf(err);
    setFieldValue('password', '');
    if (code === 'PASSWORD_EXPIRED') {
      // The first sign-in with a login slip, or an expired password: straight to a new one.
      await router.push({
        name: routesPath.auth.passwordExpired.name,
        query: { email: form.email },
      });
      return;
    }
    if (code && code in NOTICES) {
      block.value = code as AccountBlock;
      blockMessage.value = getApiErrorMessage(err, '');
    } else error.value = getApiErrorMessage(err, 'We couldn’t sign you in. Try again.');
  }
});
</script>

<template>
  <AuthLayout>
    <AuthHeading
      title="Student Portal"
      :description="`Sign in with your admission number to see your timetable, assignments and results at ${school.name}.`"
    />
    <InlineNotice
      v-if="notice"
      :tone="notice.tone"
      :title="notice.title"
      :description="notice.text"
      role="alert"
    >
      <template v-if="block === 'PASSWORD_EXPIRED'" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink
            :to="{ name: routesPath.auth.passwordExpired.name, query: { email: values.email } }"
            >Set a new password</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <form class="flex flex-col gap-4.5" novalidate @submit="onSubmit">
      <FormInput
        name="email"
        label="Admission number"
        autocomplete="username"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="STU-2025-0042"
      />
      <FormInput
        name="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        placeholder="Enter your password"
      />
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
      <Button
        type="submit"
        size="lg"
        class="h-12"
        :disabled="login.isPending.value || block === 'ACCOUNT_LOCKED'"
      >
        <Spinner v-if="login.isPending.value" />
        {{ login.isPending.value ? 'Signing in…' : 'Sign in' }}
      </Button>
    </form>
    <p class="text-[13px] text-pretty text-muted-foreground">
      Your admission number and first password are on the login slip from your school. Forgotten
      your password? Ask the school office for a new slip.
    </p>
  </AuthLayout>
</template>
