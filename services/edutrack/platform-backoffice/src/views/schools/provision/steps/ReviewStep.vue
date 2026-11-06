<script setup lang="ts">
import { PencilIcon } from '@lucide/vue';
import { useFormValues } from 'vee-validate';
import { computed, inject } from 'vue';

import { PLAN_LIMIT_LABEL } from '@/config/plans';
import { contrastWithWhite, paletteName } from '@/lib/brand-color';
import { ALL_BRANCHES, OTHER_POSITION } from '@/schema/school';
import type { AcademicSection, PlanName } from '@/types';

import { goToStepKey } from '../provision-nav';

interface ProvisionValues {
  name: string;
  legalName: string;
  ownership: string;
  registrationNumber: string;
  email: string;
  phone: string;
  state: string;
  lga: string;
  brandColor: string;
  sections: AcademicSection[];
  branches: { name: string; address: string }[];
  plan: PlanName;
  startDate: string;
  admins: {
    name: string;
    email: string;
    phone: string;
    position: string;
    positionOther: string;
    scope: string;
  }[];
}

const form = useFormValues<ProvisionValues>();
const v = computed<ProvisionValues>(() => ({
  name: '',
  legalName: '',
  ownership: '',
  registrationNumber: '',
  email: '',
  phone: '',
  state: '',
  lga: '',
  brandColor: '#24497A',
  sections: [],
  branches: [],
  plan: 'Starter',
  startDate: '',
  admins: [],
  ...form.value,
}));
const goTo = inject(goToStepKey, () => {});

const dash = (value?: string) => (value?.trim() ? value : '—');
const startDate = computed(() =>
  v.value.startDate
    ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(`${v.value.startDate}T00:00`),
      )
    : '—',
);
const plan = computed(() => PLAN_LIMIT_LABEL[v.value.plan]);
const positionOf = (a: ProvisionValues['admins'][number]) =>
  a.position === OTHER_POSITION ? dash(a.positionOther) : a.position;
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span class="font-semibold">Review</span>
    <span class="text-xs text-muted-foreground"
      >Check every detail before provisioning. Use Edit to go back to any step.</span
    >
  </div>

  <section class="review-card">
    <header>
      <h3><span>1</span>School</h3>
      <button type="button" @click="goTo(0)"><PencilIcon class="size-3.5" />Edit</button>
    </header>
    <dl>
      <dt>Display name</dt>
      <dd class="font-medium">{{ dash(v.name) }}</dd>
      <dt>Legal name</dt>
      <dd>{{ dash(v.legalName) }}</dd>
      <dt>Ownership</dt>
      <dd>{{ v.ownership }}</dd>
      <dt>Registration number</dt>
      <dd>{{ dash(v.registrationNumber) }}</dd>
      <dt>Email</dt>
      <dd>{{ dash(v.email) }}</dd>
      <dt>Phone</dt>
      <dd>{{ dash(v.phone) }}</dd>
      <dt>Location</dt>
      <dd>{{ [v.lga, v.state].filter(Boolean).join(', ') || '—' }}</dd>
      <dt>Brand color</dt>
      <dd class="flex items-center gap-2">
        <span
          class="size-4 rounded-sm ring-1 ring-black/10"
          :style="{ background: v.brandColor }"
          aria-hidden="true"
        />
        {{ paletteName(v.brandColor) }} · {{ v.brandColor.toUpperCase() }}
        <span class="text-xs text-faint"
          >{{ contrastWithWhite(v.brandColor).toFixed(1) }}:1 with white text</span
        >
      </dd>
    </dl>
  </section>

  <section class="review-card">
    <header>
      <h3><span>2</span>Academic offering</h3>
      <button type="button" @click="goTo(1)"><PencilIcon class="size-3.5" />Edit</button>
    </header>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="section in v.sections"
        :key="section"
        class="rounded-full border bg-muted px-2.5 py-0.5 text-xs"
        >{{ section }}</span
      >
    </div>
    <p class="text-xs text-faint">The Setup Center only shows steps for these sections.</p>
  </section>

  <section class="review-card">
    <header>
      <h3><span>3</span>Branches · {{ v.branches.length }}</h3>
      <button type="button" @click="goTo(2)"><PencilIcon class="size-3.5" />Edit</button>
    </header>
    <ol class="flex flex-col divide-y divide-divider rounded-md border">
      <li
        v-for="(branch, i) in v.branches"
        :key="i"
        class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-[13px]"
      >
        <span class="font-medium">{{ dash(branch.name) }}</span>
        <span class="text-muted-foreground">{{ branch.address?.trim() || 'No address yet' }}</span>
      </li>
    </ol>
  </section>

  <section class="review-card">
    <header>
      <h3><span>4</span>Subscription</h3>
      <button type="button" @click="goTo(3)"><PencilIcon class="size-3.5" />Edit</button>
    </header>
    <dl>
      <dt>Plan</dt>
      <dd class="font-medium">{{ v.plan }}</dd>
      <dt>Price</dt>
      <dd>{{ plan.price }}{{ v.plan === 'Enterprise' ? '' : ' / year' }}</dd>
      <dt>Limits</dt>
      <dd>{{ plan.students }} students · {{ plan.branches }} branches</dd>
      <dt>Starts</dt>
      <dd>{{ startDate }}</dd>
    </dl>
  </section>

  <section class="review-card">
    <header>
      <h3><span>5</span>Administrators · {{ v.admins.length }}</h3>
      <button type="button" @click="goTo(4)"><PencilIcon class="size-3.5" />Edit</button>
    </header>
    <div class="overflow-x-auto rounded-md border">
      <table class="w-full min-w-[560px] text-left text-[13px]">
        <thead class="bg-muted text-xs text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Name</th>
            <th class="px-3 py-2 font-medium">Position</th>
            <th class="px-3 py-2 font-medium">Contact</th>
            <th class="px-3 py-2 font-medium">Manages</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-divider">
          <tr v-for="(admin, i) in v.admins" :key="i">
            <td class="px-3 py-2 font-medium">{{ dash(admin.name) }}</td>
            <td class="px-3 py-2">{{ positionOf(admin) }}</td>
            <td class="px-3 py-2">
              <span class="block">{{ dash(admin.email) }}</span>
              <span v-if="admin.phone" class="text-xs text-faint">{{ admin.phone }}</span>
            </td>
            <td class="px-3 py-2">
              {{ admin.scope === ALL_BRANCHES ? 'All branches' : `${admin.scope} only` }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <p class="rounded-md bg-muted px-3 py-2.5 text-[13px]">
    Provisioning creates the tenant with status <b class="font-semibold">Onboarding</b>, creates the
    subscription and emails an invitation to
    {{
      v.admins.length === 1 ? 'the administrator' : `each of the ${v.admins.length} administrators`
    }}. No students, staff or finance data are created.
  </p>
</template>

<style scoped>
@reference '../../../../assets/main.css';

.review-card {
  @apply flex flex-col gap-3 rounded-lg border p-4;
}
.review-card header {
  @apply flex items-center justify-between gap-2;
}
.review-card h3 {
  @apply flex items-center gap-2 text-[13px] font-semibold;
}
.review-card h3 span {
  @apply flex size-5 items-center justify-center rounded-full bg-success text-[11px] text-white;
}
.review-card header button {
  @apply flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[13px] font-medium text-primary hover:bg-brand-tint;
}
.review-card dl {
  @apply grid grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-2 text-[13px];
}
.review-card dt {
  @apply text-faint;
}
</style>
