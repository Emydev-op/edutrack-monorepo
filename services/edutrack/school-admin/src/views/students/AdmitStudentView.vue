<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { CircleCheckIcon } from '@lucide/vue';
import { refDebounced, useStorage } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAdmissionMatchesQuery,
  useAdmissionOptionsQuery,
  useAdmitMutation,
  useApplicationsQuery,
  useGuardiansQuery,
} from '@/api/services/students';
import FileUpload from '@/components/school/FileUpload.vue';
import { routesPath } from '@/router/routes-path';
import type { AdmitResult, FileRef, Gender } from '@/types';

const STEPS = [
  'Student',
  'Parent / Guardian',
  'Placement',
  'Subjects',
  'Documents',
  'Fees',
  'Review',
];
const RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Sponsor'];
const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;

const route = useRoute();
const { data: options, isPending } = useAdmissionOptionsQuery();
const { data: applications } = useApplicationsQuery();
const { data: guardians } = useGuardiansQuery({ pageSize: 200 });
const admit = useAdmitMutation();

const blank = () => ({
  surname: '',
  firstName: '',
  otherNames: '',
  gender: 'Female' as Gender,
  dateOfBirth: '',
  stateOfOrigin: '',
  previousSchool: '',
  guardianMode: 'link' as 'link' | 'new' | 'skip',
  guardianId: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  relationship: 'Father',
  paysFees: true,
  invite: true,
  branch: 'Main Campus',
  level: 'JSS 1',
  arm: '',
  admissionType: 'New intake' as 'New intake' | 'Transfer in',
  admissionDate: new Date().toISOString().slice(0, 10),
  religious: 'CRS',
  elective: 'Computer Studies',
  billing: 'full' as 'full' | 'defer',
  siblingDiscount: true,
});
const d = reactive(blank());
const docs = reactive<Record<string, FileRef | null>>({ birth: null, photo: null, report: null });
const step = ref(0);
const errors = ref<Record<string, string>>({});
const serverError = ref('');
const result = ref<AdmitResult | null>(null);

/* An accepted offer fills in what the application already knows. */
const applicationId = computed(() => (route.query.application as string | undefined) ?? null);
watch(
  [applications, applicationId],
  () => {
    const app = applications.value?.find((a) => a.id === applicationId.value);
    if (!app || d.firstName) return;
    const [first = '', ...rest] = app.applicant.split(' ');
    Object.assign(d, {
      firstName: first,
      surname: rest.join(' '),
      admissionType: app.type,
      level: app.applyingFor.split(' · ')[0] ?? d.level,
      branch: app.applyingFor.split(' · ')[1] ?? d.branch,
    });
  },
  { immediate: true },
);

/* Drafts are kept on this device until the admission is completed or discarded. */
const draft = useStorage<string | null>('edutrack.school-admin.admission-draft', null);
const hasDraft = computed(() => !!draft.value && !d.firstName && !applicationId.value);
function saveDraft() {
  draft.value = JSON.stringify({ d, step: step.value });
  toast.success('Draft saved on this device. Resume it from Start admission.');
}
function resumeDraft() {
  const saved = JSON.parse(draft.value ?? '{}') as { d?: Partial<typeof d>; step?: number };
  Object.assign(d, saved.d ?? {});
  step.value = saved.step ?? 0;
}

const dirty = computed(() => JSON.stringify(d) !== JSON.stringify(blank()));
useUnsavedChanges(() => dirty.value && !result.value);

/* Possible duplicate and sibling, from the name. */
const debFirst = refDebounced(
  computed(() => d.firstName),
  400,
);
const debSurname = refDebounced(
  computed(() => d.surname),
  400,
);
const { data: matches } = useAdmissionMatchesQuery(debFirst, debSurname);
const sibling = computed(() => matches.value?.sibling ?? null);
watch(sibling, (sib) => {
  if (sib && d.guardianMode === 'link' && !d.guardianId) {
    d.guardianId = sib.guardianId;
    d.relationship = sib.relationship;
  }
});

const arms = computed(() => options.value?.arms[d.level] ?? []);
const levels = computed(() => Object.keys(options.value?.arms ?? {}));
const linkedGuardian = computed(() => guardians.value?.data.find((g) => g.id === d.guardianId));
const guardianLabel = computed(() =>
  d.guardianMode === 'link'
    ? (linkedGuardian.value?.name ?? '')
    : d.guardianMode === 'new'
      ? d.guardianName.trim()
      : '',
);
const className = computed(() => (d.arm ? `${d.level}${d.arm}` : d.level));

const feeLines = computed(() => {
  const o = options.value;
  if (!o) return [];
  const lines: [string, number][] = d.billing === 'full' ? [...o.feeItems] : [];
  lines.push(['Admission fee (one-time)', o.admissionFee]);
  if (showSibling.value && d.siblingDiscount)
    lines.push(['Sibling discount · 2nd child (rule)', -o.siblingDiscount]);
  return lines;
});
const showSibling = computed(
  () => d.guardianMode === 'link' && d.billing === 'full' && !!d.guardianId,
);
const total = computed(() => feeLines.value.reduce((a, [, n]) => a + n, 0));

function validate(i: number) {
  const e: Record<string, string> = {};
  if (i === 0) {
    if (!d.surname.trim()) e.surname = 'Enter the surname';
    if (!d.firstName.trim()) e.firstName = 'Enter the first name';
    if (!d.dateOfBirth) e.dateOfBirth = 'Enter the date of birth';
  }
  if (i === 1) {
    if (d.guardianMode === 'link' && !d.guardianId) e.guardianId = 'Choose the guardian to link';
    if (d.guardianMode === 'new') {
      if (!d.guardianName.trim()) e.guardianName = 'Enter the guardian’s full name';
      if (!NG_PHONE.test(d.guardianPhone.replace(/\s/g, '')))
        e.guardianPhone = 'Enter a Nigerian phone number, e.g. 0803 555 0193';
      if (d.guardianEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.guardianEmail))
        e.guardianEmail = 'Enter a valid email';
    }
  }
  if (i === 2) {
    const a = arms.value.find((x) => x.arm === d.arm);
    if (!a) e.arm = 'Choose a class arm';
    else if (a.used >= a.capacity)
      e.arm = `${d.level}${d.arm} is at capacity (${a.used} of ${a.capacity}). Choose another arm.`;
  }
  if (i === 4) {
    if (!docs.birth) e.birth = 'Birth certificate is required by your school settings';
    if (d.admissionType === 'Transfer in' && !docs.report)
      e.report = 'Transfer-in students need their previous school report';
  }
  return e;
}
function next() {
  errors.value = validate(step.value);
  if (Object.keys(errors.value).length) return;
  step.value += 1;
  document.getElementById('main-content')?.scrollTo({ top: 0 });
}
const goTo = (i: number) => {
  errors.value = {};
  step.value = i;
};

async function submit() {
  for (const i of [0, 1, 2, 4]) {
    const e = validate(i);
    if (Object.keys(e).length) return ((errors.value = e), (step.value = i));
  }
  serverError.value = '';
  try {
    result.value = await admit.mutateAsync({
      applicationId: applicationId.value,
      surname: d.surname.trim(),
      firstName: d.firstName.trim(),
      otherNames: d.otherNames.trim(),
      gender: d.gender,
      dateOfBirth: d.dateOfBirth,
      stateOfOrigin: d.stateOfOrigin,
      previousSchool: d.previousSchool,
      guardian:
        d.guardianMode === 'link'
          ? { mode: 'link', guardianId: d.guardianId }
          : d.guardianMode === 'new'
            ? {
                mode: 'new',
                name: d.guardianName.trim(),
                phone: d.guardianPhone,
                email: d.guardianEmail.trim(),
              }
            : { mode: 'skip' },
      relationship: d.relationship,
      paysFees: d.paysFees,
      invite: d.invite,
      branch: d.branch,
      level: d.level,
      arm: d.arm,
      admissionType: d.admissionType,
      admissionDate: d.admissionDate,
      religious: d.religious,
      elective: d.elective,
      documents: Object.fromEntries(Object.entries(docs).map(([k, f]) => [k, f?.name ?? null])),
      billing: d.billing,
      siblingDiscount: showSibling.value && d.siblingDiscount,
    });
    draft.value = null;
  } catch (e) {
    serverError.value = getApiErrorMessage(
      e,
      'The admission couldn’t be saved. Nothing was created. Try again.',
    );
  }
}

function restart() {
  Object.assign(d, blank());
  Object.assign(docs, { birth: null, photo: null, report: null });
  step.value = 0;
  errors.value = {};
  result.value = null;
}

const review = computed(() => [
  {
    title: 'Student',
    step: 0,
    rows: [
      ['Name', `${d.surname}, ${d.firstName} ${d.otherNames}`.trim()],
      ['Gender', d.gender],
      ['Date of birth', d.dateOfBirth],
      ['State of origin', d.stateOfOrigin],
      ['Previous school', d.previousSchool],
    ],
  },
  {
    title: 'Parent / Guardian',
    step: 1,
    rows:
      d.guardianMode === 'skip'
        ? [['Guardian', 'None yet · profile will be flagged incomplete']]
        : [
            [
              'Guardian',
              `${guardianLabel.value} (${d.guardianMode === 'link' ? 'existing' : 'new'})`,
            ],
            ['Relationship', d.relationship],
            ['Pays fees', d.paysFees ? 'Yes' : 'No'],
            ['Portal invitation', d.invite ? 'Send on admission' : 'Don’t send'],
          ],
  },
  {
    title: 'Placement',
    step: 2,
    rows: [
      ['Session', `${options.value?.session} · ${options.value?.term}`],
      ['Branch', d.branch],
      ['Class', className.value],
      ['Admission type', d.admissionType],
      ['Admission date', d.admissionDate],
    ],
  },
  {
    title: 'Subjects',
    step: 3,
    rows: [
      ['Compulsory', `${options.value?.compulsorySubjects.length} subjects`],
      ['Religious', d.religious],
      ['Elective', d.elective],
    ],
  },
  {
    title: 'Documents',
    step: 4,
    rows: [
      ['Birth certificate', docs.birth ? 'Uploaded' : 'Missing'],
      ['Passport photo', docs.photo ? 'Uploaded' : 'Not provided'],
      ['Previous report', docs.report ? 'Uploaded' : 'Not provided'],
    ],
  },
  {
    title: 'Fees',
    step: 5,
    rows: [
      ['First invoice', `${formatNaira(total.value)} · issued as Draft for finance to review`],
      ['Billing', d.billing === 'full' ? 'Full First Term' : 'From Second Term'],
    ],
  },
]);
const chip = (on: boolean, full = false) =>
  cn(
    'flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-left text-[13px] transition-colors',
    on
      ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
      : full
        ? 'bg-muted text-faint'
        : 'bg-card hover:bg-muted',
  );
</script>

<template>
  <template v-if="result">
    <section
      class="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center"
    >
      <CircleCheckIcon class="size-10 text-success-strong" aria-hidden="true" />
      <h1 class="text-xl font-semibold">{{ result.name }} has been admitted</h1>
      <p class="text-[13px] text-muted-foreground text-pretty">
        {{ result.admissionNo }} · {{ result.className }} · {{ options?.session }} ·
        {{ result.branch }}. Guardian: {{ result.guardianName ?? 'No guardian linked' }}.
        {{
          result.invited
            ? `Portal invitation sent to ${result.guardianName}.`
            : 'No portal invitation sent.'
        }}
        A draft invoice of {{ formatNaira(result.invoiceTotal) }} is waiting for finance.
      </p>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <Button as-child
          ><RouterLink
            :to="{ name: routesPath.students.detail.name, params: { id: result.studentId } }"
            >View student profile</RouterLink
          ></Button
        >
        <Button variant="outline" @click="restart">Admit another student</Button>
        <Button as-child variant="ghost"
          ><RouterLink :to="{ name: routesPath.students.list.name }"
            >Back to students</RouterLink
          ></Button
        >
      </div>
    </section>
  </template>

  <template v-else>
    <PageHeader
      title="Admit a student"
      description="Admission creates an enrollment for this session, subject enrollments and a draft invoice. Nothing is saved until you admit."
    />
    <Skeleton v-if="isPending" class="h-96" />
    <template v-else-if="options">
      <InlineNotice
        v-if="hasDraft"
        tone="info"
        title="You have a saved admission draft"
        description="Pick up where you left off, or start fresh."
      >
        <template #action>
          <Button size="sm" variant="outline" @click="draft = null">Discard</Button>
          <Button size="sm" @click="resumeDraft">Resume draft</Button>
        </template>
      </InlineNotice>
      <StepIndicator :steps="STEPS" :current="step" />
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="We couldn’t admit this student"
        :description="serverError"
        role="alert"
      />

      <section class="flex flex-col gap-4.5 rounded-lg border bg-card p-5">
        <!-- 1 · Student -->
        <template v-if="step === 0">
          <h2 class="text-base font-semibold">Student information</h2>
          <InlineNotice
            v-if="matches?.duplicate"
            tone="warning"
            title="Possible duplicate"
            :description="`${matches.duplicate.name} (${matches.duplicate.className}, ${matches.duplicate.admissionNo}) already exists. Check before continuing.`"
          />
          <InlineNotice
            v-else-if="sibling"
            tone="info"
            title="Possible sibling found"
            :description="`${sibling.studentName} (${sibling.className}). Their guardian is ${sibling.guardianName}. You can link the same guardian in the next step.`"
          />
          <div class="grid gap-4 sm:grid-cols-3">
            <FieldShell id="ad-surname" label="Surname" required :error="errors.surname">
              <Input
                id="ad-surname"
                v-model="d.surname"
                placeholder="e.g. Nwosu"
                :aria-invalid="!!errors.surname"
              />
            </FieldShell>
            <FieldShell id="ad-first" label="First name" required :error="errors.firstName">
              <Input
                id="ad-first"
                v-model="d.firstName"
                placeholder="e.g. Kamsi"
                :aria-invalid="!!errors.firstName"
              />
            </FieldShell>
            <FieldShell id="ad-other" label="Other names">
              <Input id="ad-other" v-model="d.otherNames" placeholder="e.g. Chidinma" />
            </FieldShell>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <span class="text-[13px] font-medium"
                >Gender <span class="text-destructive">*</span></span
              >
              <div role="radiogroup" aria-label="Gender" class="flex gap-2">
                <button
                  v-for="g in ['Female', 'Male'] as const"
                  :key="g"
                  type="button"
                  role="radio"
                  :aria-checked="d.gender === g"
                  :class="chip(d.gender === g)"
                  @click="d.gender = g"
                >
                  {{ g }}
                </button>
              </div>
            </div>
            <FieldShell id="ad-dob" label="Date of birth" required :error="errors.dateOfBirth">
              <Input
                id="ad-dob"
                v-model="d.dateOfBirth"
                type="date"
                :aria-invalid="!!errors.dateOfBirth"
              />
            </FieldShell>
            <FieldShell id="ad-origin" label="State of origin">
              <select
                id="ad-origin"
                v-model="d.stateOfOrigin"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
              >
                <option value="">Choose…</option>
                <option v-for="s in options.states" :key="s">{{ s }}</option>
              </select>
            </FieldShell>
          </div>
          <FieldShell id="ad-prev" label="Previous school">
            <Input
              id="ad-prev"
              v-model="d.previousSchool"
              placeholder="e.g. Little Angels School, Ikeja"
            />
          </FieldShell>
        </template>

        <!-- 2 · Guardian -->
        <template v-else-if="step === 1">
          <h2 class="text-base font-semibold">Parent / Guardian</h2>
          <ChoiceCards
            v-model="d.guardianMode"
            label="Guardian"
            :columns="3"
            :choices="[
              { value: 'link', label: 'Link existing guardian' },
              { value: 'new', label: 'Add new guardian' },
              { value: 'skip', label: 'Skip for now' },
            ]"
          />
          <template v-if="d.guardianMode === 'link'">
            <div
              v-if="sibling && d.guardianId === sibling.guardianId"
              class="flex items-center gap-3 rounded-lg border border-primary bg-brand-tint px-3.5 py-3 text-[13px]"
            >
              <span class="flex flex-col">
                <span class="font-semibold">{{ sibling.guardianName }}</span>
                <span class="text-muted-foreground"
                  >{{ sibling.relationship }} of {{ sibling.studentName }} ({{ sibling.className }})
                  · {{ sibling.guardianPhone }}</span
                >
                <span class="text-xs text-faint">Matched by surname</span>
              </span>
            </div>
            <FieldShell id="ad-guardian" label="Guardian" required :error="errors.guardianId">
              <select
                id="ad-guardian"
                v-model="d.guardianId"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
                :aria-invalid="!!errors.guardianId"
              >
                <option value="">Choose…</option>
                <option v-for="g in guardians?.data ?? []" :key="g.id" :value="g.id">
                  {{ g.name }} · {{ g.phone }}
                </option>
              </select>
            </FieldShell>
          </template>
          <div v-else-if="d.guardianMode === 'new'" class="grid gap-4 sm:grid-cols-3">
            <FieldShell id="ad-gname" label="Full name" required :error="errors.guardianName">
              <Input id="ad-gname" v-model="d.guardianName" placeholder="e.g. Mrs. Ada Nwosu" />
            </FieldShell>
            <FieldShell id="ad-gphone" label="Phone" required :error="errors.guardianPhone">
              <Input
                id="ad-gphone"
                v-model="d.guardianPhone"
                type="tel"
                placeholder="0803 555 0193"
              />
            </FieldShell>
            <FieldShell id="ad-gemail" label="Email" :error="errors.guardianEmail">
              <Input
                id="ad-gemail"
                v-model="d.guardianEmail"
                type="email"
                placeholder="name@example.com"
              />
            </FieldShell>
          </div>
          <InlineNotice
            v-else
            tone="warning"
            title="Admitting without a guardian"
            description="The student can be admitted without a guardian. Their profile will be flagged as incomplete, and no fee or result messages will be sent until a guardian is linked."
          />
          <div v-if="d.guardianMode !== 'skip'" class="flex flex-wrap items-end gap-5">
            <FieldShell id="ad-rel" label="Relationship">
              <select
                id="ad-rel"
                v-model="d.relationship"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
              >
                <option v-for="r in RELATIONSHIPS" :key="r">{{ r }}</option>
              </select>
            </FieldShell>
            <label class="flex h-9 items-center gap-2 text-[13px]"
              ><Checkbox v-model="d.paysFees" />Responsible for fees</label
            >
            <label class="flex h-9 items-center gap-2 text-[13px]"
              ><Checkbox v-model="d.invite" />Invite to parent portal</label
            >
          </div>
        </template>

        <!-- 3 · Placement -->
        <template v-else-if="step === 2">
          <h2 class="text-base font-semibold">Academic placement</h2>
          <div class="grid gap-4 sm:grid-cols-3">
            <FieldShell id="ad-session" label="Session">
              <Input id="ad-session" :model-value="`${options.session} · Active`" disabled />
            </FieldShell>
            <FieldShell id="ad-branch" label="Branch">
              <select
                id="ad-branch"
                v-model="d.branch"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
              >
                <option v-for="b in options.branches" :key="b">{{ b }}</option>
              </select>
            </FieldShell>
            <FieldShell id="ad-level" label="Class level">
              <select
                id="ad-level"
                v-model="d.level"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
                @change="d.arm = ''"
              >
                <option v-for="l in levels" :key="l">{{ l }}</option>
              </select>
            </FieldShell>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Arm <span class="text-destructive">*</span></span>
            <div role="radiogroup" aria-label="Arm" class="flex flex-wrap gap-2">
              <button
                v-for="a in arms"
                :key="a.arm"
                type="button"
                role="radio"
                :aria-checked="d.arm === a.arm"
                :class="chip(d.arm === a.arm, a.used >= a.capacity)"
                @click="d.arm = a.arm"
              >
                <span class="flex flex-col">
                  <span>{{ d.level }}{{ a.arm }}</span>
                  <span class="text-xs font-normal"
                    >{{ a.used }} of {{ a.capacity
                    }}{{ a.used >= a.capacity ? ' · full' : '' }}</span
                  >
                </span>
              </button>
            </div>
            <p v-if="errors.arm" role="alert" class="text-xs text-destructive">{{ errors.arm }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class="text-[13px] font-medium">Admission type</span>
              <div role="radiogroup" aria-label="Admission type" class="flex gap-2">
                <button
                  v-for="t in ['New intake', 'Transfer in'] as const"
                  :key="t"
                  type="button"
                  role="radio"
                  :aria-checked="d.admissionType === t"
                  :class="chip(d.admissionType === t)"
                  @click="d.admissionType = t"
                >
                  {{ t }}
                </button>
              </div>
            </div>
            <FieldShell id="ad-date" label="Admission date">
              <Input id="ad-date" v-model="d.admissionDate" type="date" />
            </FieldShell>
          </div>
        </template>

        <!-- 4 · Subjects -->
        <template v-else-if="step === 3">
          <h2 class="text-base font-semibold">
            Subjects · {{ d.level }} curriculum {{ options.session }}
          </h2>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Compulsory · enrolled automatically</span>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="c in options.compulsorySubjects"
                :key="c"
                class="rounded-md border bg-muted px-2.5 py-1 text-[13px]"
                >{{ c }}</span
              >
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Religious studies · choose 1</span>
            <div role="radiogroup" aria-label="Religious studies" class="flex flex-wrap gap-2">
              <button
                v-for="[code, name] in options.religiousSubjects"
                :key="code"
                type="button"
                role="radio"
                :aria-checked="d.religious === code"
                :class="chip(d.religious === code)"
                @click="d.religious = code"
              >
                {{ name }}
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Elective group A · choose 1</span>
            <div role="radiogroup" aria-label="Elective" class="flex flex-wrap gap-2">
              <button
                v-for="e in options.electives"
                :key="e"
                type="button"
                role="radio"
                :aria-checked="d.elective === e"
                :class="chip(d.elective === e)"
                @click="d.elective = e"
              >
                {{ e }}
              </button>
            </div>
            <p
              v-if="options.unstaffedElectives.includes(d.elective)"
              class="text-xs text-warning-strong"
            >
              {{ d.elective }} has no teacher for {{ options.session }} yet. The student can still
              enroll; lessons start when a teacher is assigned.
            </p>
          </div>
        </template>

        <!-- 5 · Documents -->
        <template v-else-if="step === 4">
          <h2 class="text-base font-semibold">Documents</h2>
          <div v-for="doc in options.requiredDocuments" :key="doc.key" class="flex flex-col gap-1">
            <FileUpload
              v-model="docs[doc.key]!"
              :title="`${doc.label} · ${doc.required === 'always' ? 'Required' : doc.required === 'transfer' ? (d.admissionType === 'Transfer in' ? 'Required for transfers' : 'Optional') : 'Optional'}`"
              hint="PDF, JPG or PNG, up to 5 MB"
              accept="application/pdf,image/png,image/jpeg"
              type-label="PDF, JPG or PNG"
              :max-bytes="5242880"
            />
            <p v-if="errors[doc.key]" role="alert" class="text-xs text-destructive">
              {{ errors[doc.key] }}
            </p>
          </div>
        </template>

        <!-- 6 · Fees -->
        <template v-else-if="step === 5">
          <h2 class="text-base font-semibold">
            Fees · {{ d.level }} · {{ options.term }} fee structure
          </h2>
          <ChoiceCards
            v-model="d.billing"
            label="Billing"
            :columns="2"
            :choices="[
              { value: 'full', label: `Charge full ${options.term}` },
              { value: 'defer', label: 'Start billing from Second Term' },
            ]"
          />
          <dl class="flex flex-col divide-y divide-divider rounded-lg border text-[13px]">
            <div
              v-for="[label, amount] in feeLines"
              :key="label"
              class="flex justify-between px-3.5 py-2"
            >
              <dt>{{ label }}</dt>
              <dd :class="cn('tabular-nums', amount < 0 && 'text-success-strong')">
                {{ formatNaira(amount) }}
              </dd>
            </div>
            <div class="flex justify-between bg-muted px-3.5 py-2.5 font-semibold">
              <dt>First invoice total</dt>
              <dd class="tabular-nums">{{ formatNaira(total) }}</dd>
            </div>
          </dl>
          <label v-if="showSibling" class="flex items-center gap-2.5 text-[13px]">
            <Switch v-model="d.siblingDiscount" />
            Apply sibling discount (rule: 2nd child, {{ formatNaira(options.siblingDiscount) }} off
            tuition). Finance can still override it.
          </label>
          <p class="text-xs text-muted-foreground">
            The invoice is created as Draft. Finance reviews and issues it.
          </p>
        </template>

        <!-- 7 · Review -->
        <template v-else>
          <h2 class="text-base font-semibold">Review admission</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <section
              v-for="r in review"
              :key="r.title"
              class="flex flex-col gap-2 rounded-lg border p-3.5"
            >
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold">{{ r.title }}</h3>
                <button
                  type="button"
                  class="text-[13px] font-medium text-primary hover:underline"
                  @click="goTo(r.step)"
                >
                  Edit
                </button>
              </div>
              <dl class="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <template v-for="[k, v] in r.rows" :key="k">
                  <dt class="text-faint">{{ k }}</dt>
                  <dd>{{ v || '—' }}</dd>
                </template>
              </dl>
            </section>
          </div>
        </template>

        <div class="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
          <Button variant="outline" :disabled="step === 0" @click="goTo(step - 1)">Back</Button>
          <Button variant="ghost" @click="saveDraft">Save draft</Button>
          <span class="flex-1" />
          <Button v-if="step < STEPS.length - 1" @click="next">Continue</Button>
          <Button v-else :disabled="admit.isPending.value" @click="submit">
            <Spinner v-if="admit.isPending.value" />
            {{ admit.isPending.value ? 'Admitting…' : `Admit ${d.firstName} ${d.surname}` }}
          </Button>
        </div>
      </section>
    </template>
  </template>
</template>
