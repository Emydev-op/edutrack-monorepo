<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { LockIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ResultIcon from '@edutrack/app-kit/components/common/ResultIcon.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import PasswordChecklist from '@edutrack/app-kit/components/form/PasswordChecklist.vue';

import {
  useAcceptInvitationMutation,
  useInvitationQuery,
  useLoginMutation,
} from '@/api/services/auth';
import AuthLayout from '@/components/layout/AuthLayout.vue';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage, statusOf } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { activationSchema } from '@/schema/auth';
import { useAuthStore } from '@/stores/auth';

import AuthHeading from './AuthHeading.vue';

/**
 * A parent's invitation: what the school linked (the children), then activation in three steps:
 * confirm details, create a password, ready. An expired invitation asks them to contact the
 * school (the school sends a new one).
 */
const STEPS = ['Invitation', 'Confirm details', 'Password', 'Ready'];

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const token = computed(() => String(route.params.token));
const { data: invitation, isPending, error } = useInvitationQuery(token);
const accept = useAcceptInvitationMutation();
const login = useLoginMutation();

const step = ref(0);
const failure = ref('');
const used = ref(false);
const code = computed(() => errorCodeOf(error.value));
const expired = computed(() => code.value === 'INVITATION_EXPIRED');
const invalidLink = computed(
  () => !!error.value && !expired.value && [404, 410, 400].includes(statusOf(error.value) ?? 0),
);
const childrenLine = computed(() =>
  (invitation.value?.children ?? []).map((c) => `${c.firstName} (${c.className})`).join(', '),
);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const { values, validateField, resetForm, setFieldError } = useForm({
  validationSchema: activationSchema,
  // Steps unmount as you move through them; keep what was typed for the final request.
  keepValuesOnUnmount: true,
  initialValues: { firstName: '', lastName: '', phone: '', password: '', confirmPassword: '' },
});

watch(
  invitation,
  (inv) =>
    inv &&
    resetForm({
      values: {
        ...values,
        firstName: inv.firstName,
        lastName: inv.lastName,
        phone: inv.phone ? inv.phone.replace(/^\+234(\d{3})(\d{3})(\d{4})$/, '0$1 $2 $3') : '',
      },
    }),
  { immediate: true },
);

async function advance(fields: (keyof typeof values)[], next: number) {
  const results = await Promise.all(fields.map((field) => validateField(field)));
  if (results.every((r) => r.valid)) step.value = next;
}
const toPassword = () => advance(['firstName', 'lastName', 'phone'], 2);

async function activate() {
  const ok = await Promise.all([validateField('password'), validateField('confirmPassword')]);
  if (!ok.every((r) => r.valid)) return;
  failure.value = '';
  try {
    await accept.mutateAsync({
      token: token.value,
      firstName: values.firstName ?? '',
      lastName: values.lastName ?? '',
      phone: values.phone ?? '',
      password: values.password ?? '',
    });
    step.value = 3;
  } catch (err) {
    if (errorCodeOf(err) === 'INVITATION_USED') {
      used.value = true;
      return;
    }
    const fields = fieldErrorsOf(err);
    if (fields.phone) {
      setFieldError('phone', fields.phone);
      step.value = 1;
    } else if (fields.password) setFieldError('password', fields.password);
    else failure.value = getApiErrorMessage(err, 'We couldn’t activate your account. Try again.');
  }
}

/** Signs in with the new password and opens Home with the first-visit welcome. */
async function enter() {
  const email = invitation.value?.email ?? '';
  try {
    const session = await login.mutateAsync({
      email,
      password: values.password ?? '',
      remember: false,
    });
    auth.setSession(
      { token: session.accessToken, user: session.user, school: session.school },
      false,
    );
    await router.replace({ name: routesPath.home.name, query: { first: '1' } });
  } catch {
    await router.replace({ name: routesPath.auth.login.name, query: { email } });
  }
}
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
        description="Invitations last 7 days. Contact the school office and ask them to send you a new one."
        centered
      />
      <Button as-child variant="outline" size="lg"
        ><RouterLink :to="{ name: routesPath.auth.login.name }">Go to sign in</RouterLink></Button
      >
    </template>

    <template v-else-if="invalidLink || (error && !invitation)">
      <ResultIcon tone="error" centered />
      <AuthHeading
        title="This invitation link is invalid or no longer available"
        description="It may have been replaced by a newer invitation or withdrawn. Open the latest message from the school, or contact the school office."
        centered
      />
      <Button as-child variant="outline" size="lg"
        ><RouterLink :to="{ name: routesPath.auth.login.name }">Go to sign in</RouterLink></Button
      >
    </template>

    <template v-else-if="invitation && (used || (invitation.status === 'accepted' && step < 3))">
      <ResultIcon tone="success" centered />
      <AuthHeading
        title="This account has already been activated"
        :description="`Sign in with ${invitation.email} and your password. If you’ve forgotten it, you can reset it from the sign-in page.`"
        centered
      />
      <Button as-child size="lg"
        ><RouterLink :to="{ name: routesPath.auth.login.name, query: { email: invitation.email } }"
          >Continue to sign in</RouterLink
        ></Button
      >
    </template>

    <template v-else-if="invitation">
      <StepIndicator v-if="step > 0" :steps="STEPS" :current="step" size="sm" />

      <!-- 1. The invitation -->
      <template v-if="step === 0">
        <AuthHeading
          :title="`You’re invited to join ${invitation.schoolName}`"
          description="Your school has invited you to the Parent Portal."
        />
        <div class="flex flex-col gap-2 rounded-lg border bg-card px-3.5 py-3">
          <div class="flex items-center justify-between">
            <span class="text-[13px] font-semibold">Invitation</span>
            <StatusBadge label="Pending" />
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
            <dt class="text-faint">Name</dt>
            <dd>
              {{
                [invitation.title, invitation.firstName, invitation.lastName]
                  .filter(Boolean)
                  .join(' ')
              }}
            </dd>
            <dt class="text-faint">Email</dt>
            <dd class="break-all">{{ invitation.email }}</dd>
            <dt class="text-faint">Invited by</dt>
            <dd>{{ invitation.invitedBy }}</dd>
            <dt class="text-faint">Expires</dt>
            <dd>{{ invitation.expiresOn }} · {{ invitation.expiresIn.toLowerCase() }}</dd>
          </dl>
        </div>
        <div v-if="invitation.children.length" class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold">Children linked to this invitation</span>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="c in invitation.children"
              :key="c.name"
              class="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2"
            >
              <span
                class="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                aria-hidden="true"
                >{{ initials(c.name) }}</span
              >
              <span class="flex flex-col">
                <span class="font-medium">{{ c.name }}</span>
                <span class="text-xs text-muted-foreground"
                  >{{ c.className }}{{ c.branch ? ` · ${c.branch}` : '' }}</span
                >
              </span>
            </li>
          </ul>
        </div>
        <Button size="lg" class="h-12" @click="step = 1">Accept invitation</Button>
        <p class="text-[13px] text-muted-foreground">
          Not you, or a child is missing? Contact the school office before you continue.
        </p>
      </template>

      <!-- 2. Confirm details -->
      <form
        v-else-if="step === 1"
        class="flex flex-col gap-4.5"
        novalidate
        @submit.prevent="toPassword"
      >
        <AuthHeading
          title="Confirm your details"
          description="These were filled in from your invitation. Correct your name or phone if needed."
        />
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 rounded-lg border bg-card px-3.5 py-3 text-[13px]"
        >
          <dt class="text-faint">Sign-in email</dt>
          <dd class="flex flex-col">
            <span class="break-all">{{ invitation.email }}</span>
            <span class="flex items-center gap-1 text-xs text-faint"
              ><LockIcon class="size-3" /> Set by the school · ask them to change it</span
            >
          </dd>
          <template v-if="invitation.children.length">
            <dt class="text-faint">Children</dt>
            <dd class="flex flex-col">
              <span>{{ childrenLine }}</span>
              <span class="flex items-center gap-1 text-xs text-faint"
                ><LockIcon class="size-3" /> Linked by school</span
              >
            </dd>
          </template>
        </dl>
        <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <FormInput
            name="firstName"
            label="First name"
            autocomplete="given-name"
            placeholder="Funke"
            required
          />
          <FormInput
            name="lastName"
            label="Last name"
            autocomplete="family-name"
            placeholder="Adeyemi"
            required
          />
        </div>
        <FormInput
          name="phone"
          label="Phone number"
          type="tel"
          inputmode="tel"
          placeholder="0803 555 0161"
          autocomplete="tel"
        />
        <div class="flex gap-2">
          <Button type="button" variant="outline" size="lg" class="h-12 flex-1" @click="step = 0"
            >Back</Button
          >
          <Button type="submit" size="lg" class="h-12 flex-[2]">Continue</Button>
        </div>
      </form>

      <!-- 3. Password -->
      <form
        v-else-if="step === 2"
        class="flex flex-col gap-4.5"
        novalidate
        @submit.prevent="activate"
      >
        <AuthHeading
          title="Create your password"
          :description="`You’ll sign in with ${invitation.email}.`"
        />
        <InlineNotice
          v-if="failure"
          tone="error"
          title="We couldn’t activate your account."
          :description="failure"
          role="alert"
        />
        <FormInput
          name="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          required
        >
          <template #after><PasswordChecklist :password="values.password ?? ''" /></template>
        </FormInput>
        <FormInput
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autocomplete="new-password"
          placeholder="Re-enter the password"
          required
        />
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            class="h-12 flex-1"
            :disabled="accept.isPending.value"
            @click="step = 1"
            >Back</Button
          >
          <Button type="submit" size="lg" class="h-12 flex-[2]" :disabled="accept.isPending.value">
            <Spinner v-if="accept.isPending.value" />
            {{ accept.isPending.value ? 'Activating…' : 'Create account' }}
          </Button>
        </div>
      </form>

      <!-- 4. Ready -->
      <template v-else>
        <ResultIcon tone="success" centered />
        <AuthHeading
          title="Your Parent Portal is ready"
          description="Your account has been activated. You can now see your children’s school information."
          centered
        />
        <div v-if="invitation.children.length" class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold">You’ll see information for</span>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="c in invitation.children"
              :key="c.name"
              class="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <span class="font-medium">{{ c.name }}</span>
              <span class="text-xs text-muted-foreground">{{ c.className }}</span>
            </li>
          </ul>
        </div>
        <Button size="lg" class="h-12" :disabled="login.isPending.value" @click="enter">
          <Spinner v-if="login.isPending.value" /> Continue to Parent Portal
        </Button>
      </template>
    </template>
  </AuthLayout>
</template>
