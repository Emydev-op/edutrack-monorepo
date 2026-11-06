<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { LockIcon } from '@lucide/vue';
import { isAxiosError } from 'axios';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAcceptInvitationMutation, useInvitationQuery } from '@/api/services/auth';
import ResultIcon from '@edutrack/app-kit/components/common/ResultIcon.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { routesPath } from '@/router/routes-path';
import { acceptInvitationSchema } from '@/schema/auth';

import AuthHeading from './AuthHeading.vue';

const STEPS = ['Invitation', 'Your details', 'Password', 'Confirm'];

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token));
const { data: invitation, isPending, error } = useInvitationQuery(token);
const accept = useAcceptInvitationMutation();

const step = ref(0);
const expired = computed(() => isAxiosError(error.value) && error.value.response?.status === 410);

const { values, validateField, resetForm } = useForm({
  validationSchema: acceptInvitationSchema,
  // Steps unmount as you move through them; keep what was typed for the final request.
  keepValuesOnUnmount: true,
  initialValues: { firstName: '', lastName: '', phone: '', password: '', confirmPassword: '' },
});

watch(
  invitation,
  (inv) =>
    inv && resetForm({ values: { ...values, firstName: inv.firstName, lastName: inv.lastName } }),
  {
    immediate: true,
  },
);

async function advance(fields: (keyof typeof values)[], next: number) {
  const results = await Promise.all(fields.map((field) => validateField(field)));
  if (results.every((r) => r.valid)) step.value = next;
}
const toPassword = () => advance(['firstName', 'lastName', 'phone'], 2);
const toConfirm = () => advance(['password', 'confirmPassword'], 3);

async function createAccount() {
  await accept.mutateAsync({
    token: token.value,
    firstName: values.firstName ?? '',
    lastName: values.lastName ?? '',
    phone: values.phone ?? '',
    password: values.password ?? '',
  });
  step.value = 4;
}

const goToSignIn = () =>
  router.push({ name: routesPath.auth.login.name, query: { email: invitation.value?.email } });
</script>

<template>
  <AuthLayout>
    <template v-if="isPending">
      <Skeleton class="h-8 w-3/4" />
      <Skeleton class="h-28 w-full" />
    </template>

    <template v-else-if="expired">
      <ResultIcon tone="error" centered />
      <AuthHeading
        title="This invitation has expired"
        description="Invitations are valid for 7 days. Ask the person who invited you to resend it. Each new invitation replaces the old link."
        centered
      />
      <RouterLink
        :to="{ name: routesPath.auth.login.name }"
        class="self-center text-[13px] text-primary hover:underline"
        >Go to sign in</RouterLink
      >
    </template>

    <template v-else-if="invitation && invitation.status === 'accepted' && step < 4">
      <ResultIcon tone="success" centered />
      <AuthHeading
        title="This invitation has already been accepted"
        :description="`The account for ${invitation.email} is active. Sign in with the password created during activation.`"
        centered
      />
      <Button size="lg" @click="goToSignIn">Go to sign in</Button>
    </template>

    <template v-else-if="invitation">
      <StepIndicator v-if="step < 4" :steps="STEPS" :current="step" size="sm" />

      <template v-if="step === 0">
        <AuthHeading title="You've been invited to EduTrack" />
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 rounded-md border bg-card px-3.5 py-3 text-[13px]"
        >
          <dt class="text-faint">Invited by</dt>
          <dd>{{ invitation.invitedBy }}</dd>
          <dt class="text-faint">Email</dt>
          <dd>{{ invitation.email }}</dd>
          <dt class="text-faint">Role</dt>
          <dd class="font-semibold text-brand-strong">{{ invitation.roleName }}</dd>
          <dt class="text-faint">Expires</dt>
          <dd>{{ invitation.expiresIn }}</dd>
        </dl>
        <p class="text-[13px] text-muted-foreground">
          This creates your platform account. It isn't a public sign-up: only invited EduTrack staff
          can join.
        </p>
        <Button size="lg" @click="step = 1">Accept invitation</Button>
      </template>

      <form
        v-else-if="step === 1"
        class="flex flex-col gap-4.5"
        novalidate
        @submit.prevent="toPassword"
      >
        <AuthHeading title="Your details" />
        <div class="grid grid-cols-2 gap-3">
          <FormInput
            name="firstName"
            label="First name"
            autocomplete="given-name"
            placeholder="Emeka"
          />
          <FormInput
            name="lastName"
            label="Last name"
            autocomplete="family-name"
            placeholder="Osegbo"
          />
        </div>
        <FormInput
          name="phone"
          label="Phone (optional)"
          type="tel"
          placeholder="0803 555 0123"
          autocomplete="tel"
        />
        <div class="flex flex-col gap-1.5 text-[13px] font-medium">
          <span>Email</span>
          <span
            class="flex h-9 items-center rounded-md border bg-muted px-3 font-normal text-muted-foreground"
            >{{ invitation.email }}</span
          >
          <span class="flex items-center gap-1 text-xs font-normal text-faint">
            <LockIcon class="size-3" /> Set by your inviter. Ask them to change it.
          </span>
        </div>
        <Button type="submit" size="lg">Continue</Button>
      </form>

      <form
        v-else-if="step === 2"
        class="flex flex-col gap-4.5"
        novalidate
        @submit.prevent="toConfirm"
      >
        <AuthHeading title="Set your password" />
        <FormInput
          name="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          placeholder="At least 10 characters"
        >
          <template #after><PasswordChecklist :password="values.password ?? ''" /></template>
        </FormInput>
        <FormInput
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autocomplete="new-password"
          placeholder="Re-enter the password"
        />
        <div class="flex gap-2">
          <Button type="button" variant="outline" size="lg" class="flex-1" @click="step = 1"
            >Back</Button
          >
          <Button type="submit" size="lg" class="flex-[2]">Continue</Button>
        </div>
      </form>

      <template v-else-if="step === 3">
        <AuthHeading title="Confirm your account" />
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 rounded-md border bg-card px-3.5 py-3 text-[13px]"
        >
          <dt class="text-faint">Name</dt>
          <dd>{{ values.firstName }} {{ values.lastName }}</dd>
          <dt class="text-faint">Email</dt>
          <dd>{{ invitation.email }}</dd>
          <dt class="text-faint">Role</dt>
          <dd>{{ invitation.roleName }}</dd>
          <dt class="text-faint">Password</dt>
          <dd>Set · meets policy</dd>
        </dl>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            class="flex-1"
            :disabled="accept.isPending.value"
            @click="step = 2"
            >Back</Button
          >
          <Button
            size="lg"
            class="flex-[2]"
            :disabled="accept.isPending.value"
            @click="createAccount"
          >
            <Spinner v-if="accept.isPending.value" />
            {{ accept.isPending.value ? 'Creating account…' : 'Create account' }}
          </Button>
        </div>
      </template>

      <template v-else>
        <ResultIcon tone="success" centered />
        <AuthHeading
          title="Your account is ready"
          :description="`Welcome, ${values.firstName}. Sign in with ${invitation.email} and the password you just set. Your access is set by the ${invitation.roleName} role.`"
          centered
        />
        <Button size="lg" @click="goToSignIn">Continue to sign in</Button>
      </template>
    </template>
  </AuthLayout>
</template>
