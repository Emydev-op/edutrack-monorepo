<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { CheckIcon } from '@lucide/vue';
import { useField, useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import FormCombobox from '@edutrack/app-kit/components/form/FormCombobox.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { initials } from '@edutrack/app-kit/lib/format';
import { lgasOf, NIGERIAN_STATES } from '@edutrack/app-kit/lib/nigeria-locations';

import { useSchoolProfileQuery, useUpdateSchoolProfileMutation } from '@/api/services/school';
import FileUpload from '@/components/school/FileUpload.vue';
import LockedField from '@/components/school/LockedField.vue';
import { routesPath } from '@/router/routes-path';
import { PROFILE_STEP_FIELDS, schoolProfileSchema } from '@/schema/school';
import { useAuthStore } from '@/stores/auth';
import type { FileRef, SchoolProfile } from '@/types';

import { paletteName } from './brand';

const STEPS = ['Identity & logo', 'Contact & address', 'Registration', 'Branding', 'Review'];
const LOCK = 'Set by Edutrack. Contact support to change it.';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const confirm = useConfirm();
const { data: profile, isPending } = useSchoolProfileQuery();
const save = useUpdateSchoolProfileMutation();

/** Opened from the Setup Center: saving or cancelling returns there. */
const fromSetup = computed(() => route.query.from === 'setup');
const step = ref(Math.min(4, Math.max(0, Number(route.query.step) || 0)));
const saved = ref(false);
const serverError = ref('');

const toValues = (p: SchoolProfile) => ({
  name: p.name,
  motto: p.motto,
  founded: p.founded,
  logo: p.logo,
  email: p.email,
  phone: p.phone,
  website: p.website,
  street: p.street,
  city: p.city,
  state: p.state,
  lga: p.lga,
  approvingBody: p.approvingBody,
  approvalNumber: p.approvalNumber,
  cacNumber: p.cacNumber,
  certificate: p.certificate,
});

const { values, meta, errors, validateField, validate, resetForm, setFieldValue } = useForm({
  validationSchema: schoolProfileSchema,
  keepValuesOnUnmount: true,
});
watch(profile, (p) => p && !meta.value.dirty && resetForm({ values: toValues(p) }), {
  immediate: true,
});
const { value: logo } = useField<FileRef | null>('logo');
const { value: certificate } = useField<FileRef | null>('certificate');

// A different state has different LGAs, so an LGA that isn't in it is cleared.
watch(
  () => values.state,
  (state) => {
    if (values.lga && state && !lgasOf(state).includes(values.lga)) setFieldValue('lga', '');
  },
);

useUnsavedChanges(() => meta.value.dirty && !saved.value);

const approvingBodies = computed(() =>
  [
    'Federal Ministry of Education',
    'FCT Education Secretariat',
    'Lagos State Ministry of Basic & Secondary Education',
    values.state && values.state !== 'FCT' ? `${values.state} State Ministry of Education` : '',
    profile.value?.approvingBody ?? '',
  ].filter((x, i, a) => x && a.indexOf(x) === i),
);

const stepErrors = (i: number) =>
  (PROFILE_STEP_FIELDS[i] as readonly string[]).filter(
    (k) => errors.value[k as keyof typeof errors.value],
  );

async function next() {
  const results = await Promise.all(
    (PROFILE_STEP_FIELDS[step.value] as readonly string[]).map((k) =>
      validateField(k as Parameters<typeof validateField>[0]),
    ),
  );
  if (results.every((r) => r.valid)) step.value += 1;
}

/** Required fields still wrong, counted across every step, for the review. */
const problems = ref(0);
watch(step, async (s) => {
  if (s !== 4) return;
  const { errors: all } = await validate();
  problems.value = Object.keys(all).length;
});

async function submit() {
  const result = await validate();
  if (!result.valid) {
    problems.value = Object.keys(result.errors).length;
    return;
  }
  serverError.value = '';
  try {
    const p = await save.mutateAsync({ ...values } as Parameters<typeof save.mutateAsync>[0]);
    saved.value = true;
    auth.updateSchool({
      name: p.name,
      initials: initials(p.name),
      logoUrl: p.logo?.dataUrl ?? null,
    });
    toast.success(
      fromSetup.value
        ? `School profile complete. ${p.name} is now shown across all portals.`
        : meta.value.dirty
          ? 'School details saved. Changes are live on all portals.'
          : 'No changes to save.',
    );
    await back();
  } catch (e) {
    serverError.value = getApiErrorMessage(
      e,
      'The server didn’t respond. Nothing was saved and your changes are still here. Try again.',
    );
  }
}

function requestColour() {
  void confirm({
    title: 'Request a brand color change?',
    description:
      'Edutrack support will contact you to confirm the new color. Your current color stays until they apply it.',
    details: [
      [
        'Current',
        `${paletteName(profile.value!.brandColor)} · ${profile.value!.brandColor.toUpperCase()}`,
      ],
    ],
    input: {
      label: 'What would you like to change it to?',
      placeholder: 'e.g. Our crest uses dark green (#1F5C3A)',
      required: true,
    },
    confirmLabel: 'Send request',
    action: () => toast.success('Request sent to Edutrack support. You’ll get a reply by email.'),
  });
}

const review = computed(() => {
  const v = values;
  const p = profile.value;
  const row = (label: string, value: string | undefined, warn = '') => ({
    label,
    value: value || 'Not provided',
    muted: !value,
    warn,
  });
  return [
    {
      title: 'Identity & logo',
      step: 0,
      rows: [
        row('Display name', v.name),
        row('Legal name', p?.legalName),
        row('Motto', v.motto),
        row('Year founded', v.founded),
        row(
          'Logo',
          v.logo?.name,
          v.logo ? '' : 'No logo · your initials will be used until you add one',
        ),
      ],
    },
    {
      title: 'Contact & address',
      step: 1,
      rows: [
        row('Email', v.email),
        row('Phone', v.phone),
        row('Website', v.website),
        row('Address', [v.street, v.city, v.lga, v.state].filter(Boolean).join(', ')),
      ],
    },
    {
      title: 'Registration',
      step: 2,
      rows: [
        row('Approving body', v.approvingBody),
        row('Approval number', v.approvalNumber),
        row('CAC number', v.cacNumber),
        row(
          'Certificate',
          v.certificate?.name,
          v.certificate ? '' : 'No certificate · Edutrack can’t mark your school as verified yet',
        ),
      ],
    },
    {
      title: 'Branding',
      step: 3,
      rows: [
        row('Brand color', p ? `${paletteName(p.brandColor)} · ${p.brandColor.toUpperCase()}` : ''),
      ],
    },
  ];
});

const back = () =>
  router.push({ name: fromSetup.value ? routesPath.setup.name : routesPath.school.profile.name });
const cancel = back;
</script>

<template>
  <PageHeader
    title="Edit school details"
    :description="`${profile?.name ?? ''} · changes apply to every branch and portal`"
  />

  <template v-if="isPending"><Skeleton class="h-12" /><Skeleton class="h-96" /></template>

  <div v-else-if="profile" class="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
    <nav aria-label="Profile steps" class="lg:sticky lg:top-0">
      <ol class="flex flex-col gap-1 max-lg:flex-row max-lg:flex-wrap">
        <li v-for="(label, i) in STEPS" :key="label">
          <button
            type="button"
            :aria-current="i === step ? 'step' : undefined"
            :class="
              cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]',
                i === step ? 'bg-brand-subtle font-medium text-brand-strong' : 'hover:bg-muted',
              )
            "
            @click="step = i"
          >
            <span
              :class="
                cn(
                  'flex size-5.5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  i === step && 'border-primary bg-primary text-white',
                  i !== step && stepErrors(i).length && 'border-destructive text-destructive',
                  i !== step && !stepErrors(i).length && 'bg-card text-muted-foreground',
                )
              "
              >{{ i + 1 }}</span
            >
            {{ label }}
          </button>
        </li>
      </ol>
    </nav>

    <section class="flex flex-col gap-4.5 rounded-lg border bg-card p-5">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-faint">Step {{ step + 1 }} of {{ STEPS.length }}</span>
        <h2 class="text-lg font-semibold">{{ STEPS[step] }}</h2>
      </div>

      <InlineNotice
        v-if="serverError"
        tone="error"
        title="We couldn’t save your changes"
        :description="serverError"
        role="alert"
      />

      <template v-if="step === 0">
        <p class="text-[13px] text-muted-foreground">
          How your school is named and recognised across the portals, report cards and receipts.
        </p>
        <FileUpload
          v-model="logo"
          title="School logo"
          hint="PNG, JPG or SVG · up to 1 MB · a square image works best"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          type-label="PNG, JPG or SVG"
          :max-bytes="1048576"
          preview
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <FormInput
            name="name"
            label="Display name"
            required
            placeholder="e.g. Greenfield Academy"
            hint="Shown to parents, staff and students."
          />
          <LockedField label="Legal name" :value="profile.legalName" :note="LOCK" />
          <FormInput
            name="motto"
            label="Motto"
            placeholder="e.g. Knowledge, Character, Service"
            hint="Optional · printed under your name on report cards."
          />
          <FormInput
            name="founded"
            label="Year founded"
            placeholder="e.g. 2009"
            inputmode="numeric"
          />
          <LockedField label="Ownership" :value="profile.ownership" :note="LOCK" />
          <LockedField
            label="Sections offered"
            :value="profile.sections.join(', ')"
            note="Change the sections each campus offers in Branches."
          />
        </div>
      </template>

      <template v-else-if="step === 1">
        <p class="text-[13px] text-muted-foreground">
          Where parents and staff can reach the school. Branch addresses are set separately in
          Branches.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormInput
            name="email"
            label="School email"
            type="email"
            required
            placeholder="info@school.ng"
            hint="Replies to school emails and invoices go here."
          />
          <FormInput
            name="phone"
            label="Phone number"
            type="tel"
            inputmode="tel"
            required
            placeholder="0809 555 0123"
          />
          <FormInput
            name="website"
            label="Website"
            placeholder="yourschool.ng"
            class="sm:col-span-2"
          />
          <FormTextarea
            name="street"
            label="Street address"
            required
            placeholder="e.g. 14 Adeniyi Jones Avenue"
            :rows="2"
            class="sm:col-span-2"
          />
          <FormInput name="city" label="Town / city" required placeholder="e.g. Ikeja" />
          <FormCombobox
            name="state"
            label="State"
            required
            :options="NIGERIAN_STATES"
            placeholder="Select the state"
          />
          <FormCombobox
            name="lga"
            label="LGA"
            required
            :options="values.state ? lgasOf(values.state) : []"
            :placeholder="values.state ? 'Select the LGA' : 'Select a state first'"
            :disabled="!values.state"
          />
          <LockedField
            label="Country & timezone"
            value="Nigeria · Africa/Lagos (WAT)"
            note="Set for your school’s region."
          />
        </div>
      </template>

      <template v-else-if="step === 2">
        <p class="text-[13px] text-muted-foreground">
          Your approval details. They appear on transcripts and transfer letters, never on public
          pages.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="approvingBody"
            label="Approving body"
            :options="approvingBodies"
            class="sm:col-span-2"
          />
          <FormInput
            name="approvalNumber"
            label="Approval number"
            required
            placeholder="e.g. LSMOE/PS/2009/0418"
          />
          <FormInput
            name="cacNumber"
            label="CAC registration number"
            placeholder="RC 1234567"
            hint="Optional · for private schools."
          />
        </div>
        <FileUpload
          v-model="certificate"
          title="Approval certificate"
          hint="PDF, JPG or PNG · up to 5 MB · optional, but needed for verification"
          accept="application/pdf,image/png,image/jpeg"
          type-label="PDF, JPG or PNG"
          :max-bytes="5242880"
          status="Awaiting verification by Edutrack"
        />
      </template>

      <template v-else-if="step === 3">
        <p class="text-[13px] text-muted-foreground">
          Your brand color was chosen when Edutrack created your school. It themes every portal your
          community uses.
        </p>
        <div class="flex flex-wrap items-center gap-4 rounded-lg border p-4">
          <span
            class="size-14 shrink-0 rounded-lg"
            :style="{ background: profile.brandColor }"
            aria-hidden="true"
          />
          <div class="flex flex-col text-[13px]">
            <span class="font-semibold"
              >{{ paletteName(profile.brandColor) }} · {{ profile.brandColor.toUpperCase() }}</span
            >
            <span class="text-muted-foreground"
              >Passes contrast with white text on buttons and headers.</span
            >
          </div>
          <Button type="button" variant="outline" class="ml-auto" @click="requestColour"
            >Request a change</Button
          >
        </div>
        <div
          class="flex items-center gap-3 rounded-lg p-4 text-white"
          :style="{ background: profile.brandColor }"
        >
          <span
            class="flex size-10 items-center justify-center overflow-hidden rounded-md bg-white/15 font-semibold"
          >
            <img v-if="logo?.dataUrl" :src="logo.dataUrl" alt="" class="size-full object-contain" />
            <template v-else>{{ initials(values.name || profile.name) }}</template>
          </span>
          <span class="flex flex-col">
            <span class="font-semibold">{{ values.name || profile.name }}</span>
            <span class="text-xs opacity-80">{{ values.motto || 'Your motto appears here' }}</span>
          </span>
        </div>
      </template>

      <template v-else>
        <p class="text-[13px] text-muted-foreground">
          Check everything before saving. You can edit the profile any time from School Profile.
        </p>
        <InlineNotice
          v-if="problems"
          tone="error"
          :title="`${problems} required field${problems > 1 ? 's need' : ' needs'} attention`"
          description="Go back to the highlighted step to fix it before saving."
        />
        <div class="grid gap-3 md:grid-cols-2">
          <section
            v-for="s in review"
            :key="s.title"
            class="flex flex-col gap-2 rounded-lg border p-3.5"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold">{{ s.title }}</h3>
              <button
                type="button"
                class="text-[13px] font-medium text-primary hover:underline"
                @click="step = s.step"
              >
                Edit
              </button>
            </div>
            <dl class="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <template v-for="r in s.rows" :key="r.label">
                <dt class="text-faint">{{ r.label }}</dt>
                <dd :class="r.muted && 'text-faint'">
                  {{ r.value }}
                  <span v-if="r.warn" class="block text-xs text-warning-strong">{{ r.warn }}</span>
                </dd>
              </template>
            </dl>
          </section>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-2.5 border-t border-divider pt-4">
        <span class="text-xs" :class="meta.dirty ? 'text-warning-strong' : 'text-faint'">{{
          meta.dirty ? 'Unsaved changes' : 'No changes yet'
        }}</span>
        <Button type="button" variant="ghost" class="ml-auto" @click="cancel">Cancel</Button>
        <Button v-if="step > 0" type="button" variant="outline" @click="step -= 1">Back</Button>
        <Button v-if="step < 4" type="button" @click="next">{{
          step === 3 ? 'Continue to review' : 'Continue'
        }}</Button>
        <Button
          v-else
          type="button"
          :disabled="save.isPending.value || problems > 0"
          @click="submit"
        >
          <Spinner v-if="save.isPending.value" />
          <CheckIcon v-else />
          {{ save.isPending.value ? 'Saving…' : 'Save school details' }}
        </Button>
      </div>
    </section>
  </div>
</template>
