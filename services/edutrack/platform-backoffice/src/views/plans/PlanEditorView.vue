<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useField, useForm } from 'vee-validate';
import { computed, nextTick, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import {
  useCreatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
  usePlanSchoolsQuery,
  usePlansQuery,
  usePlanStatusMutation,
  useUpdatePlanMutation,
} from '@/api/services/plans';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { MODULE_GROUPS } from '@/config/plan-modules';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { formatNaira, pluralize } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import {
  duplicatePlanForm,
  emptyPlanForm,
  formToPlan,
  planFormSchema,
  planToForm,
  type PlanFormValues,
} from '@/schema/plan';
import { useLayoutStore } from '@/stores/layout';
import type { Plan, PlanDefinition, PlanLimitKey, PlanStatus } from '@/types';

import BillingPeriods from './components/BillingPeriods.vue';
import ModulePicker from './components/ModulePicker.vue';
import PlanSummary from './components/PlanSummary.vue';
import {
  limitText,
  loweredLimits,
  optionalModuleCount,
  PLAN_LIMITS,
  planChanges,
  planWarnings,
  priceText,
  schoolsOverLimit,
} from './plan-format';

const { plans: r } = routesPath;
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();

/** Editing an existing plan, or creating one (optionally as a copy of `?from=`). */
const planId = computed(() => (route.name === r.detail.name ? String(route.params.id) : undefined));
const copyOf = computed(() =>
  route.name === r.create.name && typeof route.query.from === 'string'
    ? route.query.from
    : undefined,
);
const isNew = computed(() => !planId.value);

const { data: plans } = usePlansQuery();
const { data: plan, isPending, isError } = usePlanQuery(planId);
const { data: source } = usePlanQuery(copyOf);
const { data: usage } = usePlanSchoolsQuery(planId);

const create = useCreatePlanMutation();
const update = useUpdatePlanMutation();
const setStatus = usePlanStatusMutation();
const remove = useDeletePlanMutation();
const busy = computed(
  () =>
    create.isPending.value ||
    update.isPending.value ||
    setStatus.isPending.value ||
    remove.isPending.value,
);

const { values, meta, resetForm, handleSubmit, validateField, setFieldValue, errors } =
  useForm<PlanFormValues>({
    validationSchema: planFormSchema(() =>
      (plans.value ?? []).filter((p) => p.id !== planId.value).map((p) => p.name),
    ),
    initialValues: emptyPlanForm(),
    keepValuesOnUnmount: true,
  });

/** Loads the plan into the form when it first arrives or a save bumps its version, not on refetch. */
let loadedKey = '';
watch(
  [plan, source, () => route.fullPath],
  () => {
    const key = plan.value
      ? `${plan.value.id}@${plan.value.version}`
      : isNew.value
        ? `new:${source.value?.id ?? copyOf.value ?? ''}`
        : '';
    if (!key || key === loadedKey || (copyOf.value && !source.value)) return;
    loadedKey = key;
    resetForm({
      values: plan.value
        ? planToForm(plan.value)
        : source.value
          ? duplicatePlanForm(source.value)
          : emptyPlanForm(),
    });
  },
  { immediate: true },
);
watch(plan, (p) => layout.setRecordLabel(p?.name ?? null), { immediate: true });

const { value: model } = useField<PlanFormValues['model']>('model');
const { value: support } = useField<PlanFormValues['support']>('support');
const unlimited = Object.fromEntries(
  PLAN_LIMITS.map(({ key }) => [key, useField<boolean>(`limits.${key}.unlimited`).value]),
);
/** Unlimited clears the number, so the field shows "Unlimited" instead of a stale limit. */
function toggleUnlimited(key: PlanLimitKey, on: boolean) {
  unlimited[key]!.value = on;
  const path = `limits.${key}.value` as const;
  if (on) setFieldValue(path, null);
  if (errors.value[path]) void validateField(path);
}

const current = computed<PlanDefinition>(() => formToPlan(values as PlanFormValues));
const status = computed<PlanStatus>(() => plan.value?.status ?? 'Draft');
const changes = computed(() => (plan.value ? planChanges(plan.value, current.value) : []));
const lowered = computed(() => (plan.value ? loweredLimits(plan.value, current.value) : []));
const overLimit = computed(() =>
  lowered.value.length ? schoolsOverLimit(usage.value ?? [], current.value) : [],
);
const warnings = computed(() => [
  ...planWarnings(current.value),
  ...(overLimit.value.length
    ? [`${pluralize(overLimit.value.length, 'school is', 'schools are')} over the new limits.`]
    : []),
]);

let leaving = false;
useUnsavedChanges(() => !leaving && (isNew.value ? meta.value.dirty : changes.value.length > 0));

const PRICING_CHOICES = [
  { value: 'flat', label: 'Fixed price', description: 'A set amount per year, term or month' },
  { value: 'per_student', label: 'Per student', description: 'Charged on enrolment each term' },
  { value: 'custom', label: 'Custom', description: 'Quoted by sales for each school' },
];
const SUPPORT_CHOICES = [
  { value: 'Standard', label: 'Standard', description: 'Email and chat · next working day' },
  {
    value: 'Priority',
    label: 'Priority',
    description: 'Phone, chat and a named account manager · 4 hours',
  },
];
const atLimitHint = computed(() => {
  const { perStudent, limits } = values as PlanFormValues;
  return perStudent && !limits.students.unlimited && limits.students.value
    ? `At the limit: ${formatNaira(perStudent * limits.students.value)} per term`
    : '';
});
const yearlyWarning = computed(() =>
  planWarnings(current.value).find((w) => w.startsWith('Three')),
);

/* ---------- Actions ---------- */

function onInvalid() {
  toast.error('Fix the highlighted fields.');
  void nextTick(() =>
    document
      .querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  );
}

/** Puts the saved plan back in the form so it is no longer dirty. */
function loadSaved(saved: Plan) {
  loadedKey = `${saved.id}@${saved.version}`;
  resetForm({ values: planToForm(saved) });
}

async function createPlan(planStatus: 'Active' | 'Draft') {
  const created = await create.mutateAsync({ ...current.value, status: planStatus });
  loadSaved(created);
  leaving = true;
  await router.replace({ name: r.detail.name, params: { id: created.id } });
  leaving = false;
  toast.success(
    planStatus === 'Active'
      ? `${created.name} published. It’s now offered when provisioning schools.`
      : `${created.name} saved as a draft.`,
  );
}

const publishNew = handleSubmit(
  () =>
    confirm({
      title: `Publish ${current.value.name}?`,
      description: 'It becomes available when provisioning schools straight away.',
      details: [
        ['Price', priceText(current.value.pricing)],
        [
          'Limits',
          `${limitText(current.value, 'students')} students · ${current.value.limits.branches === 1 ? '1 branch' : `${limitText(current.value, 'branches')} branches`}`,
        ],
        ['Modules', `${optionalModuleCount(current.value.modules)} + core`],
      ],
      confirmLabel: 'Publish plan',
      action: () => createPlan('Active'),
    }),
  onInvalid,
);

const saveDraft = handleSubmit(async () => {
  try {
    await createPlan('Draft');
  } catch (err) {
    toast.error(getApiErrorMessage(err));
  }
}, onInvalid);

async function saveChanges() {
  const saved = await update.mutateAsync({ id: plan.value!.id, plan: current.value });
  loadSaved(saved);
  toast.success(
    `${saved.name} saved${saved.status === 'Active' && saved.schools ? '. Schools pick up changes as described.' : '.'}`,
  );
}

const save = handleSubmit(async () => {
  const p = plan.value!;
  if (!changes.value.length) return void toast('No changes to save.');
  if (p.status !== 'Active' || !p.schools) {
    try {
      return await saveChanges();
    } catch (err) {
      return void toast.error(getApiErrorMessage(err));
    }
  }
  const labels = changes.value.map(([label]) => label);
  const removed = labels.includes('Removed');
  const notes: [string, string][] = [
    ...(labels.includes('Price')
      ? [
          ['Price', 'Applies at each school’s next renewal. Current invoices don’t change.'] as [
            string,
            string,
          ],
        ]
      : []),
    ...(labels.includes('Added')
      ? [
          ['New modules', `Switch on for all ${p.schools} schools straight away.`] as [
            string,
            string,
          ],
        ]
      : []),
    ...(removed
      ? [
          [
            'Removed modules',
            'Stay on until each school renews, then switch off. Data is kept read-only.',
          ] as [string, string],
        ]
      : []),
    ...(lowered.value.length
      ? [
          [
            'Lower limits',
            `Apply at renewal. ${
              overLimit.value.length
                ? `${pluralize(overLimit.value.length, 'school is', 'schools are')} already over the new limit and will be flagged in Subscriptions.`
                : 'No current school is over the new limits.'
            }`,
          ] as [string, string],
        ]
      : []),
  ];
  await confirm({
    title: `Update ${p.name} for ${pluralize(p.schools, 'school')}?`,
    description: 'Every school on this plan is affected.',
    details: [...changes.value, ...notes],
    confirmLabel: 'Save changes',
    tone: removed || lowered.value.length ? 'destructive' : 'primary',
    action: saveChanges,
  });
}, onInvalid);

function changeStatus(next: 'Active' | 'Archived') {
  const p = plan.value!;
  if (changes.value.length)
    return void toast.warning('Save or discard your edits before changing the plan’s status.');
  const run = async () => {
    await setStatus.mutateAsync({ id: p.id, status: next });
    toast.success(next === 'Archived' ? `${p.name} archived.` : `${p.name} is now active.`);
  };
  if (next === 'Archived')
    return confirm({
      title: `Archive ${p.name}?`,
      description: 'It stops being offered for new schools.',
      details: [
        [
          'Schools on it',
          p.schools
            ? `${pluralize(p.schools, 'school')} · they keep it until renewal, then must move to another plan`
            : 'None',
        ],
        ['Reversible', 'Yes · restore it any time'],
      ],
      confirmLabel: 'Archive plan',
      tone: 'destructive',
      action: run,
    });
  const verb = p.status === 'Draft' ? 'Publish' : 'Restore';
  return confirm({
    title: `${verb} ${p.name}?`,
    description: 'It becomes available when provisioning schools.',
    confirmLabel: verb,
    action: run,
  });
}

const duplicate = () => router.push({ name: r.create.name, query: { from: plan.value!.id } });

function deleteDraft() {
  const p = plan.value!;
  return confirm({
    title: `Delete ${p.name}?`,
    description: 'Drafts that no school uses can be deleted. This can’t be undone.',
    confirmLabel: 'Delete draft',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(p.id);
      leaving = true;
      await router.push({ name: r.list.name });
      toast.success(`${p.name} deleted.`);
    },
  });
}

const secondary = computed(() => {
  if (isNew.value) return { label: 'Save as draft', run: saveDraft };
  if (status.value === 'Draft') return { label: 'Publish', run: () => changeStatus('Active') };
  if (status.value === 'Archived') return { label: 'Restore', run: () => changeStatus('Active') };
  return { label: 'Duplicate', run: duplicate };
});

const description = computed(() => {
  if (isNew.value)
    return source.value
      ? `A copy of ${source.value.name}. Save it as a draft or publish it straight away.`
      : 'New plans can be saved as a draft or published straight away.';
  const p = plan.value!;
  return `${p.status} · version ${p.version} · ${p.schools ? `used by ${pluralize(p.schools, 'school')}` : 'no schools on it'}`;
});
</script>

<template>
  <template v-if="!isNew && isPending"
    ><Skeleton class="h-14 w-1/2" /><Skeleton class="h-96"
  /></template>

  <EmptyState
    v-else-if="!isNew && (isError || !plan)"
    title="Plan not found"
    description="It may have been deleted, or the link is incomplete."
    illustrated
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.list.name }">Back to plans</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="isNew ? 'Create plan' : values.name?.trim() || plan!.name"
      :description="description"
    />

    <InlineNotice
      v-if="plan?.status === 'Archived'"
      tone="neutral"
      title="This plan is archived"
      :description="`It isn’t offered to new schools. Edits apply to the ${pluralize(plan.schools, 'school')} still renewing on it.`"
    />

    <form
      class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]"
      novalidate
      @submit.prevent="isNew ? publishNew() : save()"
    >
      <div class="flex min-w-0 flex-col gap-4">
        <SectionCard
          title="Basics"
          description="Shown to the Edutrack team when provisioning and on the school’s subscription page."
          class="px-5 py-4.5"
        >
          <div class="flex flex-col gap-3.5">
            <FormInput name="name" label="Plan name" required placeholder="Growth Plus" />
            <FormTextarea
              name="description"
              label="Description"
              :rows="2"
              placeholder="Growing schools with more than one campus."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Pricing"
          description="Price changes apply to existing schools at their next renewal."
          class="px-5 py-4.5"
        >
          <div class="flex flex-col gap-4">
            <ChoiceCards
              v-model="model"
              label="Pricing model"
              :choices="PRICING_CHOICES"
              :columns="3"
            />
            <BillingPeriods v-if="model === 'flat'" :warning="yearlyWarning" />
            <div v-else-if="model === 'per_student'" class="grid gap-3.5 sm:grid-cols-2">
              <FormNumber
                name="perStudent"
                label="Price per student, per term"
                prefix="₦"
                required
                placeholder="1,500"
                :hint="atLimitHint"
              />
              <FormNumber
                name="minimumPerTerm"
                label="Minimum per term"
                prefix="₦"
                placeholder="250,000"
                hint="Charged when enrolment × price is lower"
              />
            </div>
            <p v-else class="rounded-md bg-muted px-3 py-2.5 text-[13px] text-body">
              Schools on this plan get a price set during provisioning. Limits below are the
              defaults sales can adjust.
            </p>
            <div class="grid gap-3.5 sm:grid-cols-2">
              <FormNumber
                name="trialDays"
                label="Free trial"
                suffix="days"
                placeholder="14"
                hint="Blank or 0 for no trial"
              />
              <FormNumber
                name="setupFee"
                label="One-off setup fee"
                prefix="₦"
                placeholder="150,000"
                hint="Onboarding and data migration"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Limits"
          description="Schools see a warning at 90% and can’t add more once a limit is reached."
          class="px-5 py-4.5"
        >
          <div class="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <FormNumber
              v-for="lim in PLAN_LIMITS"
              :key="lim.key"
              :name="`limits.${lim.key}.value`"
              :label="lim.label"
              :suffix="lim.unit"
              :placeholder="
                unlimited[lim.key]!.value ? 'Unlimited' : lim.key === 'storage' ? '10' : '500'
              "
              :hint="lim.hint"
              :disabled="unlimited[lim.key]!.value"
            >
              <template #label-aside>
                <label class="flex items-center gap-1.5 text-xs font-normal text-body">
                  <Checkbox
                    :model-value="unlimited[lim.key]!.value"
                    class="size-3.5"
                    @update:model-value="toggleUnlimited(lim.key, $event === true)"
                  />
                  Unlimited
                </label>
              </template>
            </FormNumber>
            <FormNumber
              name="smsCreditsPerTerm"
              label="SMS credits per term"
              placeholder="1,000"
              :disabled="!values.modules?.includes('sms')"
              :hint="
                values.modules?.includes('sms')
                  ? 'Schools can buy more'
                  : 'SMS notifications is off for this plan'
              "
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Modules"
          description="What schools on this plan can use. Turning one on adds anything it needs."
          class="px-5 py-4.5"
        >
          <ModulePicker :groups="MODULE_GROUPS.filter((g) => g !== 'Portals')" />
        </SectionCard>

        <SectionCard
          title="Portals"
          description="Separate sign-ins for teachers, parents and students. Schools still decide who gets an account."
          class="px-5 py-4.5"
        >
          <ModulePicker :groups="['Portals']" />
        </SectionCard>

        <SectionCard title="Support" class="px-5 py-4.5">
          <ChoiceCards
            v-model="support"
            label="Support tier"
            :choices="SUPPORT_CHOICES"
            :columns="2"
          />
        </SectionCard>
      </div>

      <PlanSummary
        :plan="current"
        :status="status"
        :warnings="warnings"
        :changes="changes"
        :history="plan?.history ?? []"
      >
        <template #actions>
          <Button type="submit" class="h-10" :disabled="busy || (!isNew && !changes.length)">
            <Spinner v-if="create.isPending.value || update.isPending.value" />
            {{ isNew ? 'Publish plan' : 'Save changes' }}
          </Button>
          <Button variant="outline" class="h-10" :disabled="busy" @click="secondary.run()">
            {{ secondary.label }}
          </Button>
          <div class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]">
            <button
              v-if="!isNew && status !== 'Active'"
              type="button"
              class="py-1.5 hover:underline"
              @click="duplicate"
            >
              Duplicate
            </button>
            <button
              v-if="status === 'Active' && !isNew"
              type="button"
              class="py-1.5 text-destructive hover:underline"
              @click="changeStatus('Archived')"
            >
              Archive plan
            </button>
            <button
              v-if="status === 'Draft' && plan && !plan.schools"
              type="button"
              class="py-1.5 text-destructive hover:underline"
              @click="deleteDraft"
            >
              Delete draft
            </button>
            <RouterLink
              :to="{ name: r.list.name }"
              class="py-1.5 text-muted-foreground hover:text-foreground hover:underline"
              >{{ isNew ? 'Cancel' : 'Back to plans' }}</RouterLink
            >
          </div>
        </template>
      </PlanSummary>
    </form>
  </template>
</template>
