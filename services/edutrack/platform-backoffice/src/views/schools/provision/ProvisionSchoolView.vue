<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, provide, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useProvisionSchoolMutation } from '@/api/services/schools';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import { useSuccessDialog } from '@edutrack/app-kit/composables/useSuccessDialog';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { routesPath } from '@/router/routes-path';
import {
  ALL_BRANCHES,
  OTHER_POSITION,
  PROVISION_STEP_FIELDS,
  provisionSchema,
} from '@/schema/school';

import { goToStepKey } from './provision-nav';

import AdministratorStep from './steps/AdministratorStep.vue';
import BranchesStep from './steps/BranchesStep.vue';
import OfferingStep from './steps/OfferingStep.vue';
import ReviewStep from './steps/ReviewStep.vue';
import SchoolStep from './steps/SchoolStep.vue';
import SubscriptionStep from './steps/SubscriptionStep.vue';

const STEPS = [
  'School',
  'Academic offering',
  'Branches',
  'Subscription',
  'Administrators',
  'Review',
];
const STEP_VIEWS = [
  SchoolStep,
  OfferingStep,
  BranchesStep,
  SubscriptionStep,
  AdministratorStep,
  ReviewStep,
];

const router = useRouter();
const provision = useProvisionSchoolMutation();
const success = useSuccessDialog();

const { values, meta, validate, validateField, handleSubmit, resetForm } = useForm({
  validationSchema: provisionSchema,
  // Each step unmounts when you move on; without this its fields' values would be discarded.
  keepValuesOnUnmount: true,
  initialValues: {
    name: '',
    legalName: '',
    ownership: 'Private' as const,
    registrationNumber: '',
    email: '',
    phone: '',
    state: '',
    lga: '',
    brandColor: '#24497A',
    sections: ['Junior Secondary', 'Senior Secondary'],
    branches: [{ name: 'Main Campus', address: '' }],
    plan: 'Starter' as const,
    startDate: new Date().toISOString().slice(0, 10),
    admins: [
      {
        name: '',
        email: '',
        phone: '',
        position: 'Principal',
        positionOther: '',
        scope: ALL_BRANCHES,
      },
    ],
  },
});

const step = ref(0);
const error = ref('');
const submitted = ref(false);
useUnsavedChanges(() => meta.value.dirty && !submitted.value);

const isLast = computed(() => step.value === STEPS.length - 1);

/** The step that owns a field path, e.g. "admins[1].email" → the Administrators step. */
function stepOf(path: string) {
  const root = path.split(/[.[]/)[0]!;
  const index = PROVISION_STEP_FIELDS.findIndex(
    (f) => Array.isArray(f) && (f as readonly string[]).includes(root),
  );
  return index === -1 ? step.value : index;
}

async function next() {
  const fields = PROVISION_STEP_FIELDS[step.value]!;
  if (fields !== 'all') {
    const results = await Promise.all(fields.map((field) => validateField(field)));
    if (results.every((r) => r.valid)) step.value += 1;
    return;
  }
  const { valid, errors } = await validate();
  if (valid) return void (step.value += 1);
  // An earlier step's field can be the culprit; take the user there instead of failing silently.
  const firstStep = Math.min(...Object.keys(errors).map(stepOf));
  if (firstStep < step.value) step.value = firstStep;
}

// The review step's Edit links jump straight back to the step that owns a section.
provide(goToStepKey, (target) => (step.value = target));

const submit = handleSubmit(async (v) => {
  error.value = '';
  try {
    const school = await provision.mutateAsync({
      name: v.name,
      legalName: v.legalName ?? '',
      ownership: v.ownership,
      registrationNumber: v.registrationNumber ?? '',
      email: v.email,
      phone: v.phone ?? '',
      state: v.state,
      lga: v.lga ?? '',
      brandColor: v.brandColor,
      sections: v.sections,
      branches: v.branches.map((b) => ({ name: b.name, address: b.address ?? '' })),
      plan: v.plan,
      startDate: v.startDate,
      admins: v.admins.map((a) => ({
        name: a.name,
        email: a.email,
        phone: a.phone ?? '',
        position: a.position === OTHER_POSITION ? (a.positionOther ?? '') : a.position,
        scope: a.scope,
      })),
    });
    submitted.value = true;
    resetForm({ values: v });
    success.show({
      title: 'School provisioned',
      description:
        v.admins.length === 1
          ? `${school.name} is now in Onboarding. An invitation has been sent to ${v.admins[0]!.email}.`
          : `${school.name} is now in Onboarding. Invitations have been sent to ${v.admins.length} administrators.`,
      primary: {
        label: 'View school',
        to: { name: routesPath.schools.detail.name, params: { id: school.id } },
      },
      secondary: { label: 'Back to schools', to: { name: routesPath.schools.list.name } },
    });
    await router.push({ name: routesPath.schools.detail.name, params: { id: school.id } });
  } catch (err) {
    error.value = getApiErrorMessage(err);
  }
});
</script>

<template>
  <PageHeader
    title="Provision a school"
    description="Creates the tenant, its subscription and invitations for its first administrators. The school starts in Onboarding."
  />
  <StepIndicator :steps="STEPS" :current="step" />
  <form
    class="flex max-w-[880px] flex-col gap-4 rounded-lg border bg-card p-5.5"
    novalidate
    @submit.prevent="isLast ? submit() : next()"
  >
    <p
      v-if="error"
      role="alert"
      class="rounded-md bg-error-subtle px-3.5 py-3 text-[13px] text-error-strong"
    >
      {{ error }}
    </p>
    <component :is="STEP_VIEWS[step]" :school-name="values.name ?? ''" />
    <div class="flex justify-between">
      <Button
        type="button"
        variant="outline"
        :disabled="step === 0 || provision.isPending.value"
        @click="step -= 1"
      >
        <ArrowLeftIcon /> Back
      </Button>
      <Button v-if="!isLast" type="submit">Continue <ArrowRightIcon /></Button>
      <Button v-else type="submit" :disabled="provision.isPending.value">
        <Spinner v-if="provision.isPending.value" />
        <CheckIcon v-else />
        {{ provision.isPending.value ? 'Provisioning…' : `Provision ${values.name}` }}
      </Button>
    </div>
  </form>
</template>
